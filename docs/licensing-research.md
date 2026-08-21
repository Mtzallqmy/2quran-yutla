# سجل تدقيق مصادر التلاوات والإذاعات

> **قاعدة العمل:** لا يعني توفر ملف صوتي أو رابط بث للعامة وجود حق لإعادة الاستضافة. لا ينقل إلى R2 إلا محتوى يذكر ملفه أو مصدره صراحةً حق إعادة التوزيع أو ترخيصًا حرًا ملائمًا. المصادر ذات الشروط الغامضة تبقى في حالة `review_required`.

| المصدر | الحالة الأولية | الدليل | الأثر على التطبيق |
|---|---|---|---|
| Quran Foundation / Quran.com API | استخدام API داخل التطبيق فقط، لا إعادة توزيع خام أو تخزين طويل إلا وفق الاستثناءات المحددة | [Developer Terms](https://api-docs.quran.foundation/legal/developer-terms/)؛ [Audio API](https://api-docs.quran.foundation/docs/sdk/javascript/audio/) | لا نقل إلى R2. يمكن استخدامه خلف خادم مع بيانات اعتماد عند استكمال الالتزام بشروطه ومدة التخزين. |
| Quran.com Service | محتوى شخصي وغير تجاري، ومنع نسخ أو توزيع المحتوى دون موافقة كتابية | [Terms & Conditions](https://quran.com/en/terms-and-conditions) | مستبعد من R2 والربط داخل التطبيق إلى أن يصدر إذن مكتوب. |
| AlQuran Cloud | نص القرآن مرن؛ التلاوات تبقى مملوكة للقراء. تذكر الشروط بثًا وتنزيلًا شخصيًا وتعليميًا، مع تحفظات على المنتجات التجارية وإمكان طلب الإزالة | [Terms & Conditions](https://alquran.cloud/terms-and-conditions) | قائمة مراجعة/إذن. لا R2 ولا إدراج تلقائي في منتج عام قبل موافقة مكتوبة للمصدر والتلاوة المعنية. |
| Islamic Network — توضيح مجتمع الترخيص | يصرح الرد بأن حقوق التسجيل تبقى للقارئ وأنه لا يوجد منح صريح للحقوق، مع توصية بالإسناد | [Licensing clarification](https://community.islamic.network/d/231-clarification-on-licensing-and-usage-rights-for-quran-recitation-api) | `review_required` لجميع التلاوات؛ لا تنقل إلى R2 بناءً على الإتاحة أو الإيحاء وحده. |
| Wikimedia Commons — فئة تلاوات المنشاوي | الفئة تضم 115 ملفًا، لكن الترخيص يتحدد **لكل صفحة ملف** وليس للفئة كاملة | [Category](https://commons.wikimedia.org/wiki/Category:Recitations_of_the_Qur%27an_by_Al_Minshawi) | يمكن اعتماد ملفات فردية فقط بعد قراءة ترخيص صفحة الملف، وإلزام الإسناد أو ShareAlike بحسب الملف. لا يعتمد أي ملف عبر الفئة وحدها. |
| Wikimedia Commons — تلاوات Aaqib Azeez | يذكر التصنيف 172 ملفًا، لكن التراخيص فردية على صفحات الملفات | [Category](https://commons.wikimedia.org/wiki/Category:Recitations_of_the_Qur%27an_by_Aaqib_Azeez) | مرشح للفحص ملفًا ملفًا، لا لإدراج تلقائي أو أرشفة جماعية. |
| Wikimedia Commons — `Chapter 1, Al-Fatiha (Mujawwad)` بصوت Aaqib Azeez | صفحة الملف تصفه كعمل أصلي للمؤلف وتمنحه صراحةً رخصة CC BY-SA 4.0؛ تسمح بالنسخ والتوزيع والتعديل بشرط الإسناد وShareAlike | [File page](https://commons.wikimedia.org/wiki/File:Chapter_1,_Al-Fatiha_(Mujawwad)_-_Recitation_of_the_Holy_Qur%27an.mp3) | مرشح صالح لإعادة الاستضافة في R2 كملف فردي فقط، مع `attribution_snapshot` يتضمن اسم Aaqib Azeez ورابط الملف ورخصة CC BY-SA 4.0. لا يعني ذلك أن كل ملفات الفئة تحمل الترخيص نفسه. |
| Wikimedia Commons — `Sura Minshawi 1.ogg` | ملف فردي مميز بـ PD-Egypt وPublic Domain في صفحة الملف؛ يصف الفاتحة بصوت المنشاوي | [File page](https://commons.wikimedia.org/wiki/File:Sura_Minshawi_1.ogg) | مرشح صالح لإعادة الاستضافة في R2 كملف واحد بعد حفظ صفحة الترخيص والإسناد والسجل الزمني؛ لا يمتد الحكم تلقائيًا إلى بقية السور. |
| إذاعة القرآن السعودية | إعلان حكومي يؤكد إطلاق البث على الإنترنت، من دون منح ظاهر لإعادة البث أو إعادة الاستضافة | [GOV.SA announcement](https://my.gov.sa/en/news/10630) | اتصال أو إعادة بث فقط بعد إذن خطي من الجهة المالكة؛ لا R2. |
| إذاعة البحرين قرآن كريم 106.1 | صفحة رسمية من وزارة الإعلام تؤكد المحطة، لكن الترخيص/إعادة البث غير محسوم في الصفحة المراجعة | [Ministry of Information Bahrain](https://www.mia.gov.bh/media-center/quran-kareem-106-1/?lang=en) | `review_required`؛ لا R2 ولا رابط إنتاجي حتى مراجعة الشروط أو أخذ إذن. |
| إذاعة القرآن من القاهرة | وجود تطبيق رسمي يثبت الجهة وخدمة الاستماع، لكنه لا يثبت حق إعادة البث أو النسخ | [Google Play official listing](https://play.google.com/store/apps/details?id=com.mcit.holyquranradio&hl=en_US) | `review_required`؛ لا إعادة استضافة ولا استخدام رابط بث داخل المنتج دون شروط أو إذن. |
| Internet Archive — تلاوة سعد الغامدي | صفحة عنصر يرفعها مستخدم وتضع وسم Public Domain وتعرض 114 سورة، لكن لا تقدم إثباتًا من صاحب الأداء أو مالك التسجيل يثبت صحة الوسم | [Archive item](https://archive.org/details/Quran-MP3-Ghamdi) | `review_required`؛ لا تكفي بيانات الرفع التي ينشئها المستخدم لإعادة الاستضافة في R2. يلزم تأكيد كتابي من القارئ أو صاحب الحقوق أو جهة تفويض موثقة. |

## القرار التشغيلي الحالي

لا توجد في هذا السجل حتى الآن مجموعة كاملة من 114 سورة لأي من القراء المطلوبين مع دليل ترخيص صريح يبيح إعادة الاستضافة على R2. لذلك تبقى حاوية R2 وقاعدة البيانات فارغتين من أي تسجيلات طرف ثالث، ويُسجل كل مصدر أو ملف لاحقًا منفردًا مع رابط الترخيص وتاريخ المراجعة وقرار الاستخدام.

## مراجع أولية

1. [Quran Foundation Developer Terms](https://api-docs.quran.foundation/legal/developer-terms/)
2. [Quran Foundation Audio API](https://api-docs.quran.foundation/docs/sdk/javascript/audio/)
3. [Quran.com Terms & Conditions](https://quran.com/en/terms-and-conditions)
4. [AlQuran Cloud Terms & Conditions](https://alquran.cloud/terms-and-conditions)
5. [Wikimedia Commons — Audio files of Qur'an](https://commons.wikimedia.org/wiki/Category:Audio_files_of_Qur%27an)
6. [Saudi Government — Holy Quran Radio online announcement](https://my.gov.sa/en/news/10630)
