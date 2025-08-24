/**
 * 텔레그램 MarkdownV2 형식에 맞춰 특수 문자를 이스케이프 처리하는 함수
 */
function escapeMarkdownV2(text) {
    if (!text) return '';
    const charsToEscape = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
    return charsToEscape.reduce((acc, char) => acc.replace(new RegExp('\\' + char, 'g'), '\\' + char), text);
}

/**
 * Cloudflare Turnstile 토큰을 검증하는 함수
 */
async function verifyTurnstile(token, secretKey, remoteIp) {
    try {
        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret: secretKey,
                response: token,
                remoteip: remoteIp,
            }),
        });
        if (!response.ok) {
            console.error(`Turnstile API returned status: ${response.status}`);
            return false;
        }
        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error("Exception during Turnstile fetch:", error);
        return false;
    }
}


export async function onRequestPost({ request, env }) {
    try {
        // 환경 변수 로드
        const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TURNSTILE_SECRET_KEY } = env;

        if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || !TURNSTILE_SECRET_KEY) {
            console.error("CRITICAL: Environment variables are not set.");
            throw new Error("서버 설정에 문제가 발생했습니다. 관리자에게 문의하세요.");
        }

        const formData = await request.formData();
        
        // Turnstile 토큰 검증
        const token = formData.get('cf-turnstile-response')?.toString();
        const ip = request.headers.get('CF-Connecting-IP');
        if (!token || !(await verifyTurnstile(token, TURNSTILE_SECRET_KEY, ip))) {
            return new Response(JSON.stringify({ message: '비정상적인 접근입니다. (CAPTCHA 실패)' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }

        // 입력값 파싱 및 길이 검증
        const name = formData.get('name')?.toString() || '';
        const contact = formData.get('contact')?.toString() || '';
        
        const privacyAgree = formData.get('privacy_agree') ? '동의 ✅' : '비동의 ❌';
        const thirdPartyAgree = formData.get('third_party_agree') ? '동의 ✅' : '비동의 ❌';
        const marketingAgree = formData.get('marketing_agree') ? '동의 ✅' : '비동의 ❌';

        if (name.length > 50 || contact.length > 50) {
             throw new Error("입력값이 너무 깁니다.");
        }
        if (!name || !contact) {
            throw new Error("필수 입력값이 누락되었습니다.");
        }
        if (formData.get('privacy_agree') !== 'on' || formData.get('third_party_agree') !== 'on') {
            throw new Error("필수 약관에 동의해야 합니다.");
        }

        // 텔레그램 메시지 생성
        const text = `*새로운 입사 지원이 도착했습니다* 🚀\n\n*이름:* ${escapeMarkdownV2(name)}\n*연락처:* ${escapeMarkdownV2(contact)}\n\n*개인정보처리방침:* ${privacyAgree}\n*제3자 제공/활용:* ${thirdPartyAgree}\n*마케팅 수신:* ${marketingAgree}`;

        const apiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

        const telegramResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: text,
                parse_mode: 'MarkdownV2',
            }),
        });

        const telegramResult = await telegramResponse.json();

        if (!telegramResult.ok) {
            console.error('Telegram API Error:', telegramResult.description);
            throw new Error(`텔레그램 API 오류가 발생했습니다.`);
        }

        return new Response(JSON.stringify({ message: '신청 성공' }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error('An unexpected error occurred in onRequestPost:', error);
        return new Response(JSON.stringify({ message: error.message || "서버에서 알 수 없는 오류가 발생했습니다." }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
