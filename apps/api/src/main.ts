import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  // PG 웹훅 서명은 원본 바이트로 계산된다. 파싱된 객체를 다시
  // 직렬화하면 키 순서·공백이 달라져 검증이 깨진다
  const app = await NestFactory.create(AppModule, { rawBody: true })

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
