declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    SITE_ADMIN_EMAIL?: string;
    TWITCH_CLIENT_ID?: string;
    TWITCH_CREDENTIAL_KEY?: string;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    BUCKET?: R2Bucket;
  }
}
