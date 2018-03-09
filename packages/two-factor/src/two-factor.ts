import * as speakeasy from 'speakeasy';
import { DBInterface } from '@accounts/server';
import { errors } from './errors';

export interface TwoFactorService {
  secret: speakeasy.Key;
}

export interface AccountsTwoFactorOptions {
  // Two factor app name
  appName: string;
  // Two factor secret length, default to 20
  secretLength?: number;
  window?: number;
}

const defaultOptions = {
  secretLength: 20,
  window: 0,
};

export class TwoFactor {
  private options: AccountsTwoFactorOptions;
  private db: DBInterface;
  private serviceName = 'two-factor';

  constructor(options: AccountsTwoFactorOptions) {
    this.options = { ...defaultOptions, ...options };
  }

  /**
   * Set two factor store
   */
  public setStore(store: DBInterface): void {
    this.db = store;
  }

  public async authenticate(userId: string, code: string): Promise<void> {
    const user = await this.db.findUserById(userId);
    const twoFactorService: TwoFactorService = user.services[this.serviceName];
    // If user does not have 2fa set return error
    if (!twoFactorService) {
      throw new Error(errors.userTwoFactorNotSet);
    }
    if (
      !speakeasy.totp.verify({
        secret: twoFactorService.secret.base32,
        encoding: 'base32',
        token: code,
        window: this.options.window,
      })
    ) {
      throw new Error(errors.codeDidNotMatch);
    }
  }

  /**
   * Generate a new two factor secret
   */
  public getNewAuthSecret(): speakeasy.Key {
    return speakeasy.generateSecret({
      length: this.options.secretLength,
      name: this.options.appName,
    });
  }

  /**
   * Verify the code is correct
   * Add the code to the user profile
   */
  public async set(userId: string, secret: speakeasy.Key, code: string): Promise<void> {
    if (
      speakeasy.totp.verify({
        secret: secret.base32,
        encoding: 'base32',
        token: code,
        window: this.options.window,
      })
    ) {
      const twoFactorService: TwoFactorService = {
        secret,
      };
      await this.db.setService(userId, this.serviceName, twoFactorService);
    } else {
      throw new Error(errors.codeDidNotMatch);
    }
  }

  /**
   * Remove two factor for a user
   */
  public async unset(userId: string, code: string): Promise<void> {
    const user = await this.db.findUserById(userId);
    const twoFactorService: TwoFactorService = user.services[this.serviceName];
    // If user does not have 2fa set return error
    if (!twoFactorService) {
      throw new Error(errors.userTwoFactorNotSet);
    }
    if (
      speakeasy.totp.verify({
        secret: twoFactorService.secret.base32,
        encoding: 'base32',
        token: code,
        window: this.options.window,
      })
    ) {
      this.db.unsetService(userId, this.serviceName);
    } else {
      throw new Error(errors.codeDidNotMatch);
    }
  }
}
