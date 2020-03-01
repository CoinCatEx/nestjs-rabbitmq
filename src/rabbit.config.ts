export interface ConfigOptions {
  host: string;
  port: number;
  login: string;
  password: string;
  tasksQueueNormal: string;
  tasksQueueRedelivery: string;
  deadLetterRoutingKey: string;
  deadLetterRoutingKeyRedelivery: string;
  exchange: string;
  prefetch?: number;
}

export const RabbitConfigKey = "RabbitConfig";
