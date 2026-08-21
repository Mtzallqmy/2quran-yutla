# وسيط مكتبة الصوت في Cloudflare Workers

يربط هذا Worker حاوية `quran-yutla-media` في R2 بقاعدة `quran-yutla-catalog` في D1. جميع التطبيقات تقرأ قائمة الأصول من API، ثم تستخدم `streamUrl` أو `downloadUrl` الناتجين من قاعدة البيانات؛ لا تُضمّن روابط R2 أو مسارات الملفات داخل تطبيق الهاتف.

## مفاتيح الأرشفة

| نوع الأصل | المفتاح المنطقي | مفتاح R2 غير القابل للاستبدال |
|---|---|---|
| سورة قارئ | `quran/reciters/{reciter_id}/{surah_number}.mp3` | `quran/reciters/{reciter_id}/{surah_number}/versions/v{n}-{sha16}.mp3` |
| برنامج إذاعي | `radio/programs/{program_id}.mp3` | `radio/programs/{program_id}/versions/v{n}-{sha16}.mp3` |
| محاضرة | `lectures/{lecture_id}.mp3` | `lectures/{lecture_id}/versions/v{n}-{sha16}.mp3` |
| تسجيل | `recordings/{recording_id}.mp3` | `recordings/{recording_id}/versions/v{n}-{sha16}.mp3` |

لا يعاد استخدام مفتاح R2 عند تحديث ملف؛ يصبح الإصدار الجديد `ready` أولًا، ثم يتبدل `current_version_id` في D1 ضمن دفعة واحدة. بهذه الطريقة تبقى النسخة السابقة قابلة للقراءة حتى اعتماد النسخة الجديدة، ولا تنكسر الروابط أثناء الاستبدال.

## النشر الآمن

يتطلب النشر حساب Cloudflare صالحًا وWorker مخصصًا مع ربط R2 وD1 أعلاه، ثم إضافة سر `ADMIN_TOKEN` عبر `wrangler secret put ADMIN_TOKEN`. لا تستخدم المفتاح داخل تطبيق الهاتف. تحتاج أدوات الرفع الإدارية فقط إلى Bearer token، في حين أن المسارات العامة للبث والتنزيل تُرجع فقط الإصدارات `ready` من قاعدة البيانات.

## الرفع والاستئناف

يبدأ العميل الإداري جلسة رفع، ثم يرفع أجزاء موحدة الحجم مع رأس `X-Part-SHA256`. يتحقق Worker من تجزئة كل جزء قبل تمريره إلى R2 ويخزن `etag` في D1. يمكن استئناف الجلسة لمدة ست ساعات باستخدام `sessionId` نفسه؛ وتظل الرفعات غير المكتملة خاضعة لمهلة R2 الافتراضية. قبل الإكمال يقارن Worker مجموع أحجام الأجزاء بالحجم المعلن، ثم يجعل الإصدار متاحًا فقط بعد إكمال R2 بنجاح.
