/**
 * Public legal pages (privacy policy, account deletion) required by the App Store and Google Play.
 * Placeholders in [BRACKETS] must be filled in by the operator before launch — /privacy shows a
 * warning banner while any remain.
 */
export type LegalLang = 'en' | 'he';

export interface LegalPage {
  title: string;
  updated: string;
  sections: { h: string; p: string[] }[];
}

const OPERATOR = '[COMPANY LEGAL NAME]';
const CONTACT = '[PRIVACY CONTACT EMAIL]';
const ADDRESS = '[COMPANY ADDRESS]';
const UPDATED = '2026-10-21';

export const PRIVACY: Record<LegalLang, LegalPage> = {
  en: {
    title: 'Wayline privacy policy',
    updated: UPDATED,
    sections: [
      { h: 'Who we are', p: [`Wayline is operated by ${OPERATOR}, ${ADDRESS}. Questions: ${CONTACT}.`] },
      {
        h: 'What we collect and why',
        p: [
          'Phone number — only if you sign in. We store a salted hash of it, never the number itself, to recognise your account. The number is passed to our SMS provider to send your sign-in code.',
          'Saved places (home, work, favourites) — to plan routes to them. Stored with your account.',
          'Trips — start and end points and route, to give turn-by-turn directions and live arrival times. Stored with your account.',
          'Location while navigating — to guide you, including in the background when your screen is off. Your exact position is used to calculate live arrival times and is not stored with your account.',
          'Anonymous traffic data — while you navigate, the app sends GPS points to measure road speeds. They are sent with a random trip code, never your account, and the first and last 300 metres of every trip never leave your phone. A road speed is only published after at least two different trips drove it. Raw points are deleted after 7 days; only per-road averages are kept.',
          'Reports and votes (police, crashes, hazards, …) — shown to other drivers. Reports display no name. We keep a reputation score per account so reliable reporters count for more.',
          'Technical data — IP address and request logs for security and abuse prevention, kept for up to 30 days.',
        ],
      },
      {
        h: 'Who we share it with',
        p: [
          'Service providers that run Wayline for us: cloud hosting, our SMS provider (sign-in codes), and map data providers. They process data only on our instructions.',
          'Other drivers see reports and road speeds, never who made them.',
          'We do not sell personal data and do not use it for advertising.',
        ],
      },
      {
        h: 'Your choices and rights',
        p: [
          'You can use Wayline as a guest without giving a phone number.',
          'Location: you can allow location only while using the app; guidance then pauses when you leave the app.',
          'You can delete your account at any time in the app (Settings → Account → Delete account) or at /delete-account. This deletes your saved places and trips; reports you made stay on the map without being linked to you.',
          `You can ask for a copy or correction of your data at ${CONTACT}. Under the Israeli Privacy Protection Law and, where it applies, the GDPR, you can also complain to the data protection authority.`,
        ],
      },
      { h: 'Children', p: ['Wayline is not intended for children under 16 (drivers must be of legal driving age).'] },
      { h: 'Changes', p: ['We will post updates here and, for significant changes, tell you in the app.'] },
    ],
  },
  he: {
    title: 'מדיניות הפרטיות של Wayline',
    updated: UPDATED,
    sections: [
      { h: 'מי אנחנו', p: [`Wayline מופעלת על ידי ${OPERATOR}, ${ADDRESS}. שאלות: ${CONTACT}.`] },
      {
        h: 'מה אנחנו אוספים ולמה',
        p: [
          'מספר טלפון — רק אם התחברת. אנחנו שומרים גיבוב (hash) מוצפן שלו ולא את המספר עצמו, כדי לזהות את החשבון. המספר מועבר לספק ה־SMS כדי לשלוח את קוד הכניסה.',
          'מקומות שמורים (בית, עבודה, מועדפים) — כדי לתכנן אליהם מסלולים. נשמרים עם החשבון.',
          'נסיעות — נקודות מוצא ויעד ומסלול, לצורך הנחיות ניווט וזמני הגעה. נשמרות עם החשבון.',
          'מיקום בזמן ניווט — כדי להנחות אותך, גם ברקע כשהמסך כבוי. המיקום המדויק משמש לחישוב זמן הגעה ואינו נשמר עם החשבון.',
          'נתוני תנועה אנונימיים — בזמן ניווט האפליקציה שולחת נקודות GPS למדידת מהירויות בכבישים. הן נשלחות עם קוד נסיעה אקראי ולא עם החשבון, ו־300 המטרים הראשונים והאחרונים של כל נסיעה לא יוצאים מהטלפון. מהירות בכביש מתפרסמת רק אחרי שלפחות שתי נסיעות שונות עברו בו. הנקודות הגולמיות נמחקות אחרי 7 ימים; נשמרים רק ממוצעים לכל כביש.',
          'דיווחים והצבעות (משטרה, תאונות, מפגעים…) — מוצגים לנהגים אחרים ללא שם. אנחנו שומרים ציון אמינות לכל חשבון כדי שלדיווחים של מדווחים אמינים יהיה משקל רב יותר.',
          'נתונים טכניים — כתובת IP ויומני בקשות לצורכי אבטחה ומניעת שימוש לרעה, נשמרים עד 30 יום.',
        ],
      },
      {
        h: 'עם מי אנחנו משתפים',
        p: [
          'ספקי שירות שמפעילים עבורנו את Wayline: אחסון בענן, ספק ה־SMS (קודי כניסה) וספקי נתוני מפה. הם מעבדים מידע רק לפי הוראותינו.',
          'נהגים אחרים רואים דיווחים ומהירויות בכבישים, אף פעם לא מי שדיווח.',
          'אנחנו לא מוכרים מידע אישי ולא משתמשים בו לפרסום.',
        ],
      },
      {
        h: 'הבחירות והזכויות שלך',
        p: [
          'אפשר להשתמש ב־Wayline כאורח בלי למסור מספר טלפון.',
          'מיקום: אפשר לאשר מיקום רק בזמן השימוש באפליקציה; ההנחיות ייעצרו כשיוצאים ממנה.',
          'אפשר למחוק את החשבון בכל עת באפליקציה (הגדרות ← חשבון ← מחיקת החשבון) או בעמוד ‎/delete-account. המחיקה כוללת את המקומות השמורים והנסיעות; דיווחים שלך יישארו במפה בלי קישור אליך.',
          `אפשר לבקש עותק של המידע או לתקן אותו בכתובת ${CONTACT}. לפי חוק הגנת הפרטיות, ובמקרים הרלוונטיים לפי ה־GDPR, אפשר גם להתלונן לרשות להגנת הפרטיות.`,
        ],
      },
      { h: 'ילדים', p: ['Wayline לא מיועדת לילדים מתחת לגיל 16 (נהגים צריכים להיות בגיל הנהיגה החוקי).'] },
      { h: 'שינויים', p: ['נפרסם עדכונים בעמוד הזה, ועל שינויים משמעותיים נודיע באפליקציה.'] },
    ],
  },
};

export const DELETE_ACCOUNT: Record<LegalLang, LegalPage> = {
  en: {
    title: 'Delete your Wayline account',
    updated: UPDATED,
    sections: [
      { h: 'In the app (fastest)', p: ['Open Wayline → Settings → Account → Delete account, and confirm. It takes effect immediately.'] },
      {
        h: 'Without the app',
        p: [`Email ${CONTACT} from any address with the phone number on the account. We will text a code to that number to confirm it is yours, then delete the account within 7 days.`],
      },
      {
        h: 'What is deleted',
        p: [
          'Deleted: your account, phone-number hash, saved places, trip history and reputation score.',
          'Kept without any link to you: reports you made (other drivers may still need them until they expire) and anonymous road-speed averages. Security logs expire within 30 days.',
        ],
      },
    ],
  },
  he: {
    title: 'מחיקת חשבון Wayline',
    updated: UPDATED,
    sections: [
      { h: 'באפליקציה (הכי מהיר)', p: ['פתחו את Wayline ← הגדרות ← חשבון ← מחיקת החשבון, ואשרו. המחיקה מיידית.'] },
      {
        h: 'בלי האפליקציה',
        p: [`שלחו מייל ל־${CONTACT} עם מספר הטלפון של החשבון. נשלח קוד למספר הזה כדי לוודא שהוא שלכם, ונמחק את החשבון תוך 7 ימים.`],
      },
      {
        h: 'מה נמחק',
        p: [
          'נמחקים: החשבון, הגיבוב של מספר הטלפון, המקומות השמורים, היסטוריית הנסיעות וציון האמינות.',
          'נשמרים בלי קישור אליכם: דיווחים שיצרתם (נהגים אחרים עשויים להזדקק להם עד שתוקפם יפוג) וממוצעי מהירות אנונימיים בכבישים. יומני אבטחה נמחקים תוך 30 יום.',
        ],
      },
    ],
  },
};

export const hasPlaceholders = (page: LegalPage) => /\[[A-Z ]+\]/.test(JSON.stringify(page));
