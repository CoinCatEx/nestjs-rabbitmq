# Nest JS rabbitMQ implementation

![Licence](https://img.shields.io/npm/l/@nestjs/core.svg) 
![CI](https://github.com/coincatex/nestjs-rabbitmq/workflows/CI/badge.svg) 

> Easy to use RabbitMQ implementation for NestJS

Http like interface to work with AMQP protocol. Redelivery friendly. It is in production use at the [CoinCat](https://coincat.in) crypto exchange.

## Setup

### Install
```
$ npm i -S nestjs-rabbitmq
```

### Configure

Add microservice to your main.ts file
```
const amqp = await NestFactory.create(
    RabbitModule.forRoot({
      host: process.env.AMQP_QUEUE_HOST,
      port: parseInt(process.env.AMQP_QUEUE_PORT, 10),
      login: process.env.AMQP_QUEUE_LOGIN,
      password: process.env.AMQP_QUEUE_PASSWORD,
      tasksQueueNormal: process.env.AMQP_QUEUE_COMMAND_REQUEST,
      tasksQueueRedelivery: process.env.AMQP_QUEUE_REQUEST_ONCE_DELIVERY,
      deadLetterRoutingKey: process.env.AMQP_QUEUE_COMMAND_REQUEST_DEAD_LETTER,
      deadLetterRoutingKeyRedelivery:
        process.env.AMQP_QUEUE_COMMAND_REQUEST_ONCE_DELEVERY_DEAD_LETTER,
      exchange: process.env.AMQP_EXCHANGE_COMMAND,
      prefetch: parseInt(process.env.AMQP_QUEUE_PREFETCH, 10),
    }),
  );
  const transport = amqp.get<RabbitTransport>(RabbitTransport);
  app.connectMicroservice({
    strategy: transport,
    options: {},
  });

  app.startAllMicroservices();
```

Then use in any Controller. You can return any value, `Promise` or `Observable`. The result will be automatically sent to the result queue if success or to `dead letter` queue otherwise.
```
  @AMQP('say_hi')
  warmUp(@AMQPRequest requestId: string, @AMQPParam q: HiMessage): Observable<Result> {
    return this.hiService.greet(requestId, q);
  }
```

## Contributing

If you'd like to add or fix stuff, feel free to file a pull request.
The best way to submit feedback and report bugs is to open a GitHub issue.

## Stay in touch
* Author - [CoinCat](https://coincat.in)
