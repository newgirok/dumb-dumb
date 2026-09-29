import 'reflect-metadata'
import type { INestApplicationContext } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { IoAdapter } from '@nestjs/platform-socket.io'
import type { ServerOptions } from 'socket.io'
import { AppModule } from './app.module'

/**
 * socket.io CORS는 설정 파일을 읽은 뒤에 넣는다. 게이트웨이 데코레이터에서 process.env를 읽으면
 * 모듈을 불러오는 순간(.env.local을 읽기 전)에 값이 정해져, 파일에 둔 WEB_ORIGIN이 먹지 않는다
 */
class CorsIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origin: string,
  ) {
    super(app)
  }

  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, { ...options, cors: { origin: this.origin, credentials: true } })
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.useWebSocketAdapter(new CorsIoAdapter(app, process.env.WEB_ORIGIN ?? 'http://localhost:3000'))
  await app.listen(Number(process.env.PORT ?? 9002))
}

void bootstrap()
