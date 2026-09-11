import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000'
  app.enableCors({ origin, credentials: true })

  await app.listen(Number(process.env.PORT ?? 9001))
}

void bootstrap()
