import {
  Kaito,
  Controller,
  Get,
  Post,
  Schema,
  KTX,
  KRT,
} from "@kaito-http/core";

@Controller("/")
class Home {
  @Get("/spotify")
  async home(): KRT<{ success: boolean }> {
    return { body: { success: true } };
  }
}

const app = new Kaito({
  controllers: [new Home()],
  logging: true,
}).listen(8080);
