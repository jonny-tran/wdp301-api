import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

const END_POINT = 'wdp301-api';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix(END_POINT);

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Central Kitchen API')
    .setDescription('API documentation for WDP301 Project')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${END_POINT}/docs`, app, document);

  const port = configService.get<number>('PORT');
  if (!port) {
    throw new Error('PORT is not defined in environment variables');
  }

  await app.listen(port);
  logger.log(
    `Swagger is running on port http://localhost:${port}/${END_POINT}/docs`,
  );
}
void bootstrap();
