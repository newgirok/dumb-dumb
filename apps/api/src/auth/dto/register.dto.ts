import { IsEmail, IsString, Length, Matches } from 'class-validator'

export class RegisterDto {
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  email: string

  // 길이만 강제하고 문자 종류는 막지 않는다. 복잡도 규칙은 오히려 예측 가능한
  // 비밀번호를 유도한다는 게 NIST 권고다
  @IsString()
  @Length(8, 72, { message: '비밀번호는 8자 이상이어야 합니다.' })
  password: string

  @IsString()
  @Length(2, 32)
  @Matches(/^[^\s].*[^\s]$|^[^\s]$/, { message: '닉네임 앞뒤 공백은 쓸 수 없습니다.' })
  nickname: string
}
