import { plainToClass } from "class-transformer";
import { MQMessage } from "../models/MQMessage";

describe("MQMessage test", function() {
  it("test1", done => {
    const input = JSON.stringify({ key: "hey" });
    const message = plainToClass(MQMessage, {
      content: { data: input }
    });
    expect(message.content.key).toBe("hey");
    done();
  });
});
