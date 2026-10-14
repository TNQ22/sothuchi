// Cloudflare Worker: Google OAuth Token Bridge for Sổ Thu Chi PWA
// Hỗ trợ lưu trữ Refresh Token và tự động gia hạn token vĩnh viễn trên iPhone/iOS không cần đăng nhập lại

export default {
  async fetch(request, env, ctx) {
    // Xử lý CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const url = new URL(request.url);

    // Endpoint 1: Đổi Auth Code lấy Access Token + Refresh Token
    if (request.method === "POST" && url.pathname === "/token") {
      try {
        const body = await request.json();
        if (!body.code || !body.client_id) {
          return new Response(JSON.stringify({ error: "Missing code or client_id" }), {
            status: 400,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }

        const params = new URLSearchParams({
          code: body.code,
          client_id: body.client_id,
          client_secret: body.client_secret || env.GOOGLE_CLIENT_SECRET || "",
          redirect_uri: body.redirect_uri || "postmessage",
          grant_type: "authorization_code",
        });

        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        });

        const data = await res.json();
        return new Response(JSON.stringify(data), {
          status: res.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    // Endpoint 2: Dùng Refresh Token để lấy Access Token mới ngầm (chạy mượt trên iPhone)
    if (request.method === "POST" && url.pathname === "/refresh") {
      try {
        const body = await request.json();
        if (!body.refresh_token || !body.client_id) {
          return new Response(JSON.stringify({ error: "Missing refresh_token or client_id" }), {
            status: 400,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }

        const params = new URLSearchParams({
          refresh_token: body.refresh_token,
          client_id: body.client_id,
          client_secret: body.client_secret || env.GOOGLE_CLIENT_SECRET || "",
          grant_type: "refresh_token",
        });

        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        });

        const data = await res.json();
        return new Response(JSON.stringify(data), {
          status: res.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        service: "So Thu Chi - Google Token Bridge",
        usage: "POST /token or POST /refresh"
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      }
    );
  },
};
