import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { initRuntimeConfig } from './config/env';

async function bootstrap(): Promise<void> {
  const runtimeConfig = initRuntimeConfig();
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableCors();

  await app.listen(runtimeConfig.port);
  console.log(`Server is listening on http://localhost:${runtimeConfig.port} (${runtimeConfig.nodeEnv})`);
}

void bootstrap();
