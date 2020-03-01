import { PatternMetadata } from "@nestjs/microservices";
import {
  PATTERN_HANDLER_METADATA,
  PATTERN_METADATA
} from "@nestjs/microservices/constants";
import { PatternHandler } from "@nestjs/microservices/enums/pattern-handler.enum";

export type AMQPMethodParam<T = string | PatternMetadata> = T;
export type AMQPMethod = (metadata?: AMQPMethodParam) => any;
export type AQPMMethodDescriptor = () => void;

const AMQP_MESSAGE = Symbol("AMQP_MESSAGE");
const AMQP_REQUEST_ID = Symbol("AMQP_REQUEST_ID");
const AMQP_PARAM = Symbol("AMQP_PARAM");

export const AMQP: AMQPMethod = (metadata?: AMQPMethodParam) => {
  return (
    target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<AQPMMethodDescriptor>
  ) => {
    const method: (...args: any[]) => void = descriptor.value;
    descriptor.value = function(...args: any[]) {
      const merge = (...arrs: Array<any>[]) => {
        return arrs.reduce((prev, curr) => {
          const max =
            prev.length === Math.max(prev.length, curr.length) ? prev : curr;
          const min = max === prev ? curr : prev;
          return max.map((value, index) => {
            if (!value && index < min.length) {
              return min[index];
            }
            return value;
          });
        }, []);
      };
      const newArgs = merge(
        prepareParams(
          target,
          propertyKey,
          AMQP_MESSAGE,
          mqvalue => mqvalue.message,
          args
        ),
        prepareParams(
          target,
          propertyKey,
          AMQP_REQUEST_ID,
          mqvalue => mqvalue.message.properties.correlationId,
          args
        ),
        prepareParams(
          target,
          propertyKey,
          AMQP_PARAM,
          mqvalue => mqvalue.data,
          args
        )
      );

      return method.apply(this, newArgs);
    };

    Reflect.defineMetadata(PATTERN_METADATA, metadata, descriptor.value);
    Reflect.defineMetadata(
      PATTERN_HANDLER_METADATA,
      PatternHandler.MESSAGE,
      descriptor.value
    );

    return descriptor;
  };
};

export const AMQPMessage = (
  target: object,
  propertyKey: string | symbol,
  parameterIndex: number
) => {
  prepareArg(target, propertyKey, parameterIndex, AMQP_MESSAGE);
};

export const AMQPRequest = (
  target: object,
  propertyKey: string | symbol,
  parameterIndex: number
) => {
  prepareArg(target, propertyKey, parameterIndex, AMQP_REQUEST_ID);
};

export const AMQPParam = (
  target: object,
  propertyKey: string | symbol,
  parameterIndex: number
) => {
  prepareArg(target, propertyKey, parameterIndex, AMQP_PARAM);
};

const prepareArg = (
  target: object,
  propertyKey: string | symbol,
  parameterIndex: number,
  metaDataKey: symbol
) => {
  const existingRequiredParameters: number[] =
    Reflect.getOwnMetadata(metaDataKey, target, propertyKey) || [];
  existingRequiredParameters.push(parameterIndex);
  Reflect.defineMetadata(
    metaDataKey,
    existingRequiredParameters,
    target,
    propertyKey
  );
};

const prepareParams = (
  target: object,
  propertyKey: string | symbol,
  metaDataKey: symbol,
  action: (mqvalue) => any,
  args: any[]
): any[] => {
  const messageParameters: number[] = Reflect.getOwnMetadata(
    metaDataKey,
    target,
    propertyKey
  );
  let newArgs = [];
  if (messageParameters && messageParameters.length) {
    newArgs = new Array<number>(Math.max(...messageParameters, 0) + 1);
    for (let i = 0; i < newArgs.length; i++) {
      newArgs[i] = null;
    }
    messageParameters.forEach((_, index) => {
      newArgs[messageParameters[index]] = action(args[0]);
    });
  }
  return newArgs;
};
