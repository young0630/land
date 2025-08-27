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
        const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TURNSTILE_SECRET_KEY } = env;

        if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || !TURNSTILE_SECRET_KEY) {
            throw new Error("서버 설정에 문제가 발생했습니다. 관리자에게 문의하세요.");
        }

        const formData = await request.formData();
        
        const token = formData.get('cf-turnstile-response')?.toString();
        const ip = request.headers.get('CF-Connecting-IP');
        if (!token || !(await verifyTurnstile(token, TURNSTILE_SECRET_KEY, ip))) {
            return new Response(JSON.stringify({ message: '비정상적인 접근입니다.' }), { status: 403 });
        }

        // 1. 플랫폼에서 넘어온 정보 (URL 파라미터)
        const urlParamsString = formData.get('url_params')?.toString() || '';
        let platformInfo = '없음';
        if (urlParamsString) {
            const params = new URLSearchParams(urlParamsString);
            let paramsText = [];
            for (const [key, value] of params.entries()) {
                paramsText.push(`*${escapeMarkdownV2(key)}:* ${escapeMarkdownV2(value)}`);
            }
            if(paramsText.length > 0) {
                platformInfo = paramsText.join('\n');
            }
        }

        // 2. 사용자가 최종적으로 입력한 정보
        const applicationType = formData.get('application_type')?.toString() || '선택 안함';
        const submittedName = formData.get('name')?.toString() || '';
        const submittedContact = formData.get('contact')?.toString() || '';
        const scrollDepth = formData.get('scroll_depth')?.toString() || '0%';
        
        if (!submittedName || !submittedContact) {
            throw new Error("필수 입력값이 누락되었습니다.");
        }
        if (formData.get('privacy_agree') !== 'on') {
            throw new Error("개인정보처리방침에 동의해야 합니다.");
        }

        // 3. 최종 텔레그램 메시지 조합
        const text = `*🚀 새로운 입사 지원*

*📋 플랫폼 전달 정보*
${platformInfo}

*👤 사용자 최종 입력 정보*
*지원 유형:* ${escapeMarkdownV2(applicationType)}
*이름:* ${escapeMarkdownV2(submittedName)}
*연락처:* ${escapeMarkdownV2(submittedContact)}

*🔍 사용자 행동*
*페이지 스크롤:* ${escapeMarkdownV2(scrollDepth)}
        `;

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

        return new Response(JSON.stringify({ message: '신청 성공' }), { status: 200 });

    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return new Response(JSON.stringify({ message: error.message || "서버 오류 발생" }), { status: 500 });
    }
}
