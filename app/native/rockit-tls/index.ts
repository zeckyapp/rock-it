import { NativeModules } from 'react-native';

export interface TlsReply {
  status: number;
  body: string;
  /** The fingerprint of the certificate the server showed. */
  pin: string;
}

interface Native {
  request(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string,
    pin: string,
    timeoutMs: number,
  ): Promise<TlsReply>;
}

const native = NativeModules.RockitTls as Native | undefined;

/**
 * HTTPS that trusts only the certificate with this fingerprint (SHA-256 of
 * the certificate, base64url). An empty pin accepts any certificate and
 * reports its fingerprint; only use that to learn it once.
 */
export function pinnedRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    pin: string;
    timeoutMs?: number;
  },
): Promise<TlsReply> {
  if (native == null) {
    return Promise.reject(
      Object.assign(new Error('Encrypted connections are not built in.'), {
        code: 'missing',
      }),
    );
  }
  return native.request(
    url,
    options.method ?? 'GET',
    options.headers ?? {},
    options.body ?? '',
    options.pin,
    options.timeoutMs ?? 8000,
  );
}
