import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));

  const port = Number(process.env['PORT'] ?? 8080);
  await app.listen(port);
  console.log(`Server is listening on http://localhost:${port}`);
}

void bootstrap();
