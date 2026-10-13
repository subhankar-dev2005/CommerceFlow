import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiBaseUrl, isLocalhostOrLoopbackUrl } from './config.js';

describe('Frontend API URL Configuration & Production Build Safety (P0.2)', () => {
  it('1. accepts a valid production API URL and strips trailing slashes', () => {
    const resolved = resolveApiBaseUrl({
      url: 'https://api.example.com/api/v1///',
      isProduction: true,
    });
    assert.equal(resolved, 'https://api.example.com/api/v1');
  });

  it('2. throws a descriptive error when VITE_API_BASE_URL is missing/undefined in production', () => {
    assert.throws(
      () => {
        resolveApiBaseUrl({
          url: undefined,
          isProduction: true,
        });
      },
      {
        message: /\[CommerceFlow Config Error\] Missing VITE_API_BASE_URL environment variable in production/,
      }
    );
  });

  it('3. throws a descriptive error when VITE_API_BASE_URL is empty or whitespace in production', () => {
    assert.throws(
      () => {
        resolveApiBaseUrl({
          url: '   ',
          isProduction: true,
        });
      },
      {
        message: /\[CommerceFlow Config Error\] Missing VITE_API_BASE_URL environment variable in production/,
      }
    );
  });

  it('4. strictly rejects localhost and loopback development URLs for production', () => {
    // localhost host
    assert.throws(
      () => {
        resolveApiBaseUrl({
          url: 'http://localhost:4000/api/v1',
          isProduction: true,
        });
      },
      {
        message: /\[CommerceFlow Config Error\] Invalid VITE_API_BASE_URL for production/,
      }
    );

    // 127.0.0.1 IPv4 loopback
    assert.throws(
      () => {
        resolveApiBaseUrl({
          url: 'http://127.0.0.1:4000/api/v1',
          isProduction: true,
        });
      },
      {
        message: /\[CommerceFlow Config Error\] Invalid VITE_API_BASE_URL for production/,
      }
    );

    // 0.0.0.0 any-interface loopback
    assert.throws(
      () => {
        resolveApiBaseUrl({
          url: 'http://0.0.0.0:4000/api/v1',
          isProduction: true,
        });
      },
      {
        message: /\[CommerceFlow Config Error\] Invalid VITE_API_BASE_URL for production/,
      }
    );

    // [::1] IPv6 loopback
    assert.throws(
      () => {
        resolveApiBaseUrl({
          url: 'http://[::1]:4000/api/v1',
          isProduction: true,
        });
      },
      {
        message: /\[CommerceFlow Config Error\] Invalid VITE_API_BASE_URL for production/,
      }
    );
  });

  it('5. preserves safe localhost default fallback and custom URLs in development mode', () => {
    // Default fallback when candidate is omitted
    const defaultDev = resolveApiBaseUrl({
      url: undefined,
      isProduction: false,
    });
    assert.equal(defaultDev, 'http://localhost:4000/api/v1');

    // Custom local URL in development mode
    const customDev = resolveApiBaseUrl({
      url: 'http://localhost:5000/api/v1/',
      isProduction: false,
    });
    assert.equal(customDev, 'http://localhost:5000/api/v1');
  });

  it('6. isLocalhostOrLoopbackUrl helper correctly identifies local development hosts', () => {
    assert.equal(isLocalhostOrLoopbackUrl('http://localhost:4000/api/v1'), true);
    assert.equal(isLocalhostOrLoopbackUrl('http://127.0.0.1:4000/api/v1'), true);
    assert.equal(isLocalhostOrLoopbackUrl('http://0.0.0.0:4000/api/v1'), true);
    assert.equal(isLocalhostOrLoopbackUrl('http://[::1]:4000/api/v1'), true);
    assert.equal(isLocalhostOrLoopbackUrl('http://subdomain.localhost:4000'), true);
    assert.equal(isLocalhostOrLoopbackUrl('https://api.example.com/api/v1'), false);
    assert.equal(isLocalhostOrLoopbackUrl('https://commerceflow.production.net/api'), false);
  });
});
