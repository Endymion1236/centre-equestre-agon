import chunk00 from "@/lib/catalogue-assets/chunk-00";
import chunk01 from "@/lib/catalogue-assets/chunk-01";
import chunk02 from "@/lib/catalogue-assets/chunk-02";
import chunk03 from "@/lib/catalogue-assets/chunk-03";
import chunk04 from "@/lib/catalogue-assets/chunk-04";

export const runtime = "nodejs";
export const dynamic = "force-static";

const image = Buffer.from(chunk00 + chunk01 + chunk02 + chunk03 + chunk04, "base64");

export async function GET() {
  return new Response(image, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(image.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
