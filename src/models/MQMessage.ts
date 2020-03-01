import { Transform } from "class-transformer";

export class MQMessage {
  @Transform(
    val => {
      let res = Buffer.from(val.data).toString("utf8");
      try {
        res = JSON.parse(res);
      } catch (e) {}
      return res;
    },
    { toClassOnly: true }
  )
  content: any;
}
