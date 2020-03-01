import { CustomTransportStrategy } from "@nestjs/microservices";
import { Server } from "@nestjs/microservices/server/server";
import {
  Channel,
  connect,
  Connection,
  Message,
  Options,
  Replies
} from "amqplib/callback_api";
import { RabbitModel } from "./models/rabbit.model";
import { fromPromise } from "rxjs/internal-compatibility";
import {
  BehaviorSubject,
  combineLatest,
  merge,
  Observable,
  of,
  Subject,
  throwError,
  timer,
  zip
} from "rxjs";
import { catchError, map, switchMap } from "rxjs/operators";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigOptions, RabbitConfigKey } from "./rabbit.config";
import { deserialize, plainToClass } from "class-transformer";
import { MQMessage } from "./models/MQMessage";
import AssertQueue = Replies.AssertQueue;
import AssertExchange = Options.AssertExchange;

type CB<T, E, Q> = (err: E, res: T) => Q;
type CBWE<T, Q> = (res: T) => Q;

@Injectable()
export class RabbitTransport extends Server implements CustomTransportStrategy {
  private connection: Connection;

  constructor(@Inject(RabbitConfigKey) private options: ConfigOptions) {
    super();
  }

  private observabify<T, E, Q>(
    func: (cb: CB<T, E, Q>, ...params) => Q,
    ...params
  ): Observable<T> {
    const result = new Subject<T>();
    func.call(
      this,
      ...[
        ...params,
        (err: E, res: T) => {
          if (err) {
            result.error(err);
          } else {
            result.next(res);
          }
        }
      ]
    );
    return result;
  }

  private observabifyConsume<T, Q>(
    queue: string,
    func: (cb: CBWE<T, Q>) => Q,
    options: Options.Consume
  ): Observable<T> {
    const result = new Subject<T>();
    func.call(
      this,
      ...[
        queue,
        (res: T) => {
          result.next(res);
        },
        options
      ]
    );
    return result;
  }

  listen(callback: (a) => void): any {
    return this.connectMQ().toPromise();
  }

  connectMQ() {
    return this.observabify(
      connect,
      `amqp://${this.options.login}:${this.options.password}@${
        this.options.host
      }:${this.options.port}`
    ).pipe(
      switchMap(connection => {
        const result = new BehaviorSubject(connection);
        this.connection = connection as Connection;
        this.connection.on("error", err => {
          result.error(`Connection closed`);
        });
        this.listenTasks(this.connection);
        return result;
      }),
      catchError(error => {
        console.error(error);
        console.log("reconnect in 5 seconds...");

        return timer(5).pipe(switchMap(_ => this.connectMQ()));
      })
    );
  }

  listenTasks(connection: Connection) {
    this.observabify<Channel, any, void>(
      connection.createChannel.bind(connection)
    )
      .pipe(
        catchError(err => {
          console.error(err);
          return throwError(err);
        }),
        switchMap(channel =>
          zip(
            this.observabify<AssertExchange, any, void>(
              channel.assertExchange.bind(channel),
              this.options.exchange,
              "direct",
              { durable: true }
            ),
            of(channel)
          )
        ),
        switchMap(([_, channel]) =>
          merge(
            this.subscribeQueue(
              channel,
              this.options.tasksQueueRedelivery,
              true
            ),
            this.subscribeQueue(channel, this.options.tasksQueueNormal, false)
          )
        )
      )
      .subscribe(
        ([result, task]) => {
          console.log(
            `Got result: ${JSON.stringify(
              result
            )} for task: ${this.messageToLog(task)}`,
            task.properties.correlationId
          );
        },
        error => {
          console.error(error);
        }
      );
  }

  subscribeQueue(
    channel: Channel,
    queue: string,
    checkRedelivery: boolean
  ): Observable<any> {
    return zip(
      this.observabify<AssertQueue, any, void>(
        channel.assertQueue.bind(channel),
        this.options.deadLetterRoutingKey,
        {
          durable: true
        }
      ),
      this.observabify<AssertQueue, any, void>(
        channel.assertQueue.bind(channel),
        this.options.deadLetterRoutingKeyRedelivery,
        {
          durable: true
        }
      )
    ).pipe(
      switchMap(([q1, q2]) =>
        zip(
          this.observabify<Replies.Empty, any, void>(
            channel.bindQueue.bind(channel),
            q1.queue,
            this.options.exchange,
            q1.queue,
            {}
          ),
          this.observabify<Replies.Empty, any, void>(
            channel.bindQueue.bind(channel),
            q2.queue,
            this.options.exchange,
            q2.queue,
            {}
          )
        )
      ),
      switchMap(_ =>
        this.observabify<AssertQueue, any, void>(
          channel.assertQueue.bind(channel),
          queue,
          {
            durable: true,
            deadLetterExchange: this.options.exchange,
            deadLetterRoutingKey: checkRedelivery
              ? this.options.deadLetterRoutingKeyRedelivery
              : this.options.deadLetterRoutingKey
          }
        )
      ),
      switchMap(queue =>
        this.observabify<Replies.Empty, any, void>(
          channel.bindQueue.bind(channel),
          queue.queue,
          this.options.exchange,
          queue.queue,
          {}
        )
      ),
      switchMap(_ => {
        channel.prefetch(this.options.prefetch);
        console.log("Awaiting RPC requests " + queue);
        return this.observabifyConsume<Message, void>(
          queue,
          channel.consume.bind(channel),
          {
            noAck: false
          }
        ).pipe(
          switchMap(message => {
            console.log(
              "Received message to process: " + this.messageToLog(message),
              message.properties.correlationId
            );
            if (checkRedelivery && message.fields.redelivered) {
              const error =
                "The message is redelivered: " + message.content.toString();
              channel.reject(message, false);
              return throwError({ error, qpMessage: message });
            }
            return of(message);
          }),
          switchMap(message =>
            combineLatest([
              this.processTask(
                plainToClass(
                  RabbitModel,
                  JSON.parse(message.content.toString())
                ),
                message
              ),
              of(message)
            ]).pipe(
              catchError(error => {
                console.error(
                  `Error during processing message: ${this.messageToLog(
                    message
                  )}`,
                  null,
                  message.properties.correlationId
                );
                channel.reject(message, false);
                return throwError({ error, qpMessage: message });
              })
            )
          ),
          map(([result, message]) => {
            console.log(
              "got result, sending it to result queue... " +
                JSON.stringify(result),
              message.properties.correlationId
            );
            channel.sendToQueue(
              message.properties.replyTo,
              Buffer.from(JSON.stringify(result)),
              {
                correlationId: message.properties.correlationId,
                persistent: true
              }
            );
            channel.ack(message);
            return [result, message];
          }),
          catchError((err, caught) => {
            if (err.qpMessage) {
              console.error(
                `Error occured after we've got message: ${this.messageToLog(
                  err.qpMessage
                )}`,
                null,
                err.qpMessage.properties.correlationId
              );
              console.error(
                err.error,
                null,
                err.qpMessage.properties.correlationId
              );
              return caught;
            } else {
              return throwError(err);
            }
          })
        );
      })
    );
  }

  processTask(message: RabbitModel, qpMessage: Message): Observable<any> {
    if (this.messageHandlers.get(message.action)) {
      return fromPromise(
        this.messageHandlers.get(message.action)({
          data: message.data,
          message: qpMessage
        })
      ).pipe(
        switchMap(result => {
          let obs;
          if (result instanceof Observable) {
            obs = result;
          } else if ((result as unknown) instanceof Promise) {
            obs = fromPromise(result);
          } else {
            obs = of(result);
          }
          return obs.pipe(
            map(result => {
              if (result) {
                return result;
              } else {
                return "{done: true}";
              }
            })
          );
        })
      );
    }
    return throwError("There is no appropriate handler: " + message.action);
  }

  close(): any {
    if (this.connection) {
      this.connection.close();
    }
  }

  private messageToLog(message: Message): string {
    try {
      return JSON.stringify(deserialize(MQMessage, JSON.stringify(message)));
    } catch (e) {
      return "";
    }
  }
}
