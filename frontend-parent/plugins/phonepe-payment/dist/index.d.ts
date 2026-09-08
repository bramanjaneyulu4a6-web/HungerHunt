export interface PhonePeCheckoutOptions {
  merchantId: string;
  /** Required by PhonePe on iOS; unused on Android. */
  appId?: string;
  flowId: string;
  orderId: string;
  token: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  appSchema: string;
}

export interface PhonePeCheckoutResult {
  status: 'RETURNED' | 'CANCELLED' | 'FAILURE' | 'INTERRUPTED';
  message?: string;
}

export interface PhonePeUpiIntentOptions {
  intentUrl: string;
}

export interface PhonePePaymentPlugin {
  startCheckout(options: PhonePeCheckoutOptions): Promise<PhonePeCheckoutResult>;
  openUpiIntent(options: PhonePeUpiIntentOptions): Promise<PhonePeCheckoutResult>;
}

export declare const PhonePePayment: PhonePePaymentPlugin;
