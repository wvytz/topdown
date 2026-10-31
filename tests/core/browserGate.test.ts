import { describe, expect, it } from 'vitest';
import { isPlainSafari, safariOverride, shouldBlockBrowser } from '@/core/browserGate';

const UA = {
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  ipadSafari:
    'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
  iphoneEdge:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/130.2849.80 Mobile/15E148 Safari/605.1.15',
  iphoneDuckDuckGo:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Ddg/18.1 Safari/604.1',
  iphoneGoogleApp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/340.0.689 Mobile/15E148 Safari/604.1',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  windowsFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.102 Mobile Safari/537.36',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36',
};

describe('isPlainSafari', () => {
  it('rozpoznaje Safari na Macu, iPhonie i iPadzie', () => {
    expect(isPlainSafari(UA.macSafari)).toBe(true);
    expect(isPlainSafari(UA.iphoneSafari)).toBe(true);
    expect(isPlainSafari(UA.ipadSafari)).toBe(true);
  });

  it('wpuszcza inne przeglądarki na iPhonie, choć działają na WebKicie', () => {
    for (const ua of [UA.iphoneChrome, UA.iphoneFirefox, UA.iphoneEdge, UA.iphoneDuckDuckGo, UA.iphoneGoogleApp]) {
      expect(isPlainSafari(ua)).toBe(false);
    }
  });

  it('wpuszcza przeglądarki na PC i Androidzie', () => {
    for (const ua of [UA.windowsChrome, UA.windowsEdge, UA.windowsFirefox, UA.androidChrome, UA.androidWebView]) {
      expect(isPlainSafari(ua)).toBe(false);
    }
  });

  it('wpuszcza Brave na iPhonie, który ma user-agent Safari, ale przedstawia się przez navigator.brave', () => {
    expect(isPlainSafari(UA.iphoneSafari, true)).toBe(false);
  });
});

describe('furtka ?safari=', () => {
  it('czyta parametr z adresu', () => {
    expect(safariOverride('?safari=1')).toBe('show');
    expect(safariOverride('?hero=archer&safari=0')).toBe('allow');
    expect(safariOverride('?hero=archer')).toBeNull();
  });

  it('?safari=1 pokazuje ekran w każdej przeglądarce, ?safari=0 wpuszcza Safari', () => {
    expect(shouldBlockBrowser(UA.windowsChrome, '?safari=1')).toBe(true);
    expect(shouldBlockBrowser(UA.iphoneSafari, '?safari=0')).toBe(false);
    expect(shouldBlockBrowser(UA.iphoneSafari, '')).toBe(true);
    expect(shouldBlockBrowser(UA.windowsChrome, '')).toBe(false);
  });
});
