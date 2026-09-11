import { IsString, IsUrl, Length } from 'class-validator'

export class OauthCallbackDto {
  @IsString()
  @Length(1, 2048)
  code: string

  /**
   * 코드 교환 시 공급자가 발급 때와 같은 값인지 대조하므로, 인가 요청에
   * 썼던 주소를 그대로 다시 보내야 한다.
   */
  @IsUrl({ require_tld: false })
  redirectUri: string
}
