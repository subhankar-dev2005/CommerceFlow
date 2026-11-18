import { describe, it, expect } from "vitest";
import {
  parseImagePayload,
  validateLogoBuffer,
  validateSvgSafety,
  MAX_LOGO_FILE_SIZE_BYTES
} from "./logo-validator.js";

describe("Logo Validator Unit Tests", () => {
  // 1x1 valid transparent PNG
  const validPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const validPngBuffer = Buffer.from(validPngBase64, "base64");

  // Valid JPEG header
  const validJpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01
  ]);

  // Valid WebP header
  const validWebpBuffer = Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.from([0x24, 0x00, 0x00, 0x00]), // size
    Buffer.from("WEBP", "ascii"),
    Buffer.from("VP8 ", "ascii")
  ]);

  // Clean SVG
  const validSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="teal"/></svg>`;
  const validSvgBuffer = Buffer.from(validSvg, "utf8");

  describe("parseImagePayload", () => {
    it("parses raw base64 string without data url scheme", () => {
      const { buffer, declaredMimeType } = parseImagePayload(validPngBase64);
      expect(declaredMimeType).toBeNull();
      expect(buffer.equals(validPngBuffer)).toBe(true);
    });

    it("parses data URL scheme and extracts declared MIME type", () => {
      const dataUrl = `data:image/png;base64,${validPngBase64}`;
      const { buffer, declaredMimeType } = parseImagePayload(dataUrl);
      expect(declaredMimeType).toBe("image/png");
      expect(buffer.equals(validPngBuffer)).toBe(true);
    });

    it("rejects non-string or empty input", () => {
      expect(() => parseImagePayload("")).toThrowError(/Image payload is required/);
      expect(() => parseImagePayload(null)).toThrowError(/Image payload is required/);
    });

    it("rejects invalid base64 characters", () => {
      expect(() => parseImagePayload("data:image/png;base64,***NOT_BASE_64***")).toThrowError(
        /invalid base64 encoding/
      );
    });
  });

  describe("validateLogoBuffer - magic bytes", () => {
    it("detects and validates PNG magic bytes", () => {
      const result = validateLogoBuffer(validPngBuffer);
      expect(result.mimeType).toBe("image/png");
      expect(result.extension).toBe("png");
      expect(result.size).toBe(validPngBuffer.length);
    });

    it("detects and validates JPEG magic bytes", () => {
      const result = validateLogoBuffer(validJpegBuffer);
      expect(result.mimeType).toBe("image/jpeg");
      expect(result.extension).toBe("jpg");
    });

    it("detects and validates WebP magic bytes", () => {
      const result = validateLogoBuffer(validWebpBuffer);
      expect(result.mimeType).toBe("image/webp");
      expect(result.extension).toBe("webp");
    });

    it("detects and validates clean SVG", () => {
      const result = validateLogoBuffer(validSvgBuffer);
      expect(result.mimeType).toBe("image/svg+xml");
      expect(result.extension).toBe("svg");
    });

    it("rejects corrupted files with fewer than 8 bytes", () => {
      const shortBuffer = Buffer.from([0x89, 0x50, 0x4e]);
      expect(() => validateLogoBuffer(shortBuffer)).toThrowError(/too small or corrupted/);
    });

    it("rejects unsupported format (e.g. text file or PDF)", () => {
      const fakePdf = Buffer.from("%PDF-1.4 header contents that are not image");
      expect(() => validateLogoBuffer(fakePdf)).toThrowError(/Unsupported or invalid image file format/);
    });

    it("rejects oversized buffers (> 2MB)", () => {
      const oversized = Buffer.alloc(MAX_LOGO_FILE_SIZE_BYTES + 1024, 0x89);
      // Give it PNG magic bytes at start
      validPngBuffer.copy(oversized, 0, 0, 8);
      expect(() => validateLogoBuffer(oversized)).toThrowError(/exceeds the 2MB limit/);
    });
  });

  describe("validateSvgSafety - security & injection checks", () => {
    it("rejects SVG with embedded <script> tags", () => {
      const maliciousSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg"><script>alert('xss')</script></svg>`
      );
      expect(() => validateSvgSafety(maliciousSvg)).toThrowError(/<script> elements are strictly prohibited/);
    });

    it("rejects SVG with inline event handlers like onload", () => {
      const maliciousSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle cx="10" cy="10" r="5"/></svg>`
      );
      expect(() => validateSvgSafety(maliciousSvg)).toThrowError(/Active event handlers/);
    });

    it("rejects SVG with javascript: pseudo-protocol", () => {
      const maliciousSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>Click</text></a></svg>`
      );
      expect(() => validateSvgSafety(maliciousSvg)).toThrowError(/Script URLs and inline HTML data schemes/);
    });

    it("rejects SVG with XML External Entity (XXE) definitions", () => {
      const xxeSvg = Buffer.from(
        `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg>&xxe;</svg>`
      );
      expect(() => validateSvgSafety(xxeSvg)).toThrowError(/XML external entity \(XXE\)/);
    });

    it("rejects SVG with foreignObject containing HTML", () => {
      const foreignObjectSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject width="100" height="100"><body xmlns="http://www.w3.org/1999/xhtml"><iframe src="https://evil.com"></iframe></body></foreignObject></svg>`
      );
      expect(() => validateSvgSafety(foreignObjectSvg)).toThrowError(/Embedded interactive containers/);
    });

    it("rejects malformed SVG missing closing tag", () => {
      const incompleteSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="5">`);
      expect(() => validateSvgSafety(incompleteSvg)).toThrowError(/missing root <svg> or closing <\/svg> tag/);
    });
  });
});
