// Traditional Chinese, Hong Kong usage. Clinic details are demo data.
const zhHK = {
  brand: '晴光牙科醫務中心',
  navLabel: '主選單',
  langLabel: '語言',
  loading: '載入中',
  nav: { clinic: '診所環境', services: '牙科服務', dentist: '牙醫簡介' },
  bookShort: '預約',
  menuOpen: '開啟選單',
  menuClose: '關閉選單',

  hero: {
    line1: '歡迎蒞臨',
    line2: '晴光牙科醫務中心',
    sub: '現代牙科，溫柔關懷。我們會在舒適、安全的環境中為你提供植牙、口腔外科、美容牙科及家庭牙科等護理服務。',
    book: '預約診症',
    call: '致電 2888 0000',
    alt: '病人在診療椅上微笑，牙醫正以比色板配對牙齒顏色',
  },

  clinic: {
    title: '診所環境',
    lead: '明亮整潔的診療室，每項治療開始前，醫生都會先清楚講解。',
    link: '查看地址及交通',
    altMirror: '病人手持鏡子查看治療效果',
    altConsult: '牙醫在診療室與少年病人傾談',
    altChair: '病人在診療椅上放鬆',
    factBig: 'F 出口',
    factNote: '港鐵銅鑼灣站，步行即達海晴中心 12 樓。',
  },

  services: {
    title: '牙科服務',
    intro: '由阻生智慧牙手術到全家定期檢查，都可以在同一間診所完成。',
    bookThis: '預約此項目',
    list: {
      surgery: {
        name: '口腔外科',
        alt: '牙醫為病人進行口腔檢查',
        desc: '陳醫生具多年醫院口腔頜面外科經驗，專門處理阻生智慧牙等牙床骨手術。',
        items: '手術脫牙、手術脫智慧牙、口腔手術、口腔病理',
      },
      implant: {
        name: '植牙及假牙',
        alt: '牙醫以器械為病人治療',
        desc: '配合電腦掃描評估，為缺牙提供植牙、牙橋或活動牙托方案。',
        items: '植牙、牙橋、活動牙托、電腦掃描',
      },
      cosmetic: {
        name: '美容牙科',
        alt: '牙醫為病人配對牙齒顏色',
        desc: '改善牙齒的顏色、形狀及排列。',
        items: '牙齒美容、漂牙、牙齒矯正',
      },
      family: {
        name: '家庭牙科',
        alt: '少年病人戴上護目鏡準備檢查',
        desc: '全家的日常牙齒護理，由修補到根管治療。',
        items: '牙齒修復、根管治療、牙週病治療',
      },
    },
  },

  dentist: {
    title: '牙醫簡介',
    name: '陳子朗醫生',
    role: '牙科醫生',
    bio: '陳醫生曾於公立醫院口腔頜面外科服務多年，現時專注植牙及口腔手術，相信清楚的解說能令治療更安心。',
    creds: ['香港大學牙醫學士', '香港牙科醫學院院員（口腔頜面外科）', '英國愛丁堡皇家外科醫學院牙科院員'],
    book: '預約陳醫生',
    alt: '陳子朗醫生',
    altTreatment: '陳醫生為病人進行治療',
  },

  booking: {
    title: '網上預約',
    intro: '選好日期及時段，我們會致電與你確認。',
    name: '姓名',
    phone: '電話',
    service: '服務（可選）',
    serviceAny: '未決定 / 一般檢查',
    date: '預約日期',
    time: '預約時段',
    choose: '請選擇',
    timeFirst: '請先選擇日期',
    consent: '我已閱讀並同意《私隱政策》，授權診所使用我的個人資料安排是次預約。',
    submit: '送出預約',
    note: '我們將致電與你確認預約。',
    errName: '請輸入姓名',
    errPhone: '請輸入 8 位數字的香港電話號碼',
    errDate: '請選擇日期',
    errTime: '請選擇時段',
    errConsent: '請先同意私隱政策',
    doneTitle: '已收到你的預約申請',
    doneText: '我們會於應診時間內致電 {{phone}}，確認 {{date}} {{time}} 的預約。',
    again: '再預約一次',
  },

  contact: {
    title: '聯絡我們',
    address: '銅鑼灣晴光道 18 號海晴中心 12 樓 1203 室（港鐵 F 出口）',
    hours: '應診時間',
    days: { weekdays: '星期一至五', saturday: '星期六', sunday: '星期日及公眾假期' },
    closed: '休息',
  },

  status: {
    openUntil: '應診中，至{{time}}',
    opensToday: '今日{{time}}開始應診',
    backAfterLunch: '午膳休息，{{time}}開始應診',
    closedUntil: '已休息，{{day}}{{time}}應診',
    tomorrow: '明天',
  },

  footer: {
    line: '銅鑼灣的口腔外科及家庭牙科診所。',
    clinic: '診所',
    more: '更多',
    email: '電郵查詢',
    where: '海晴中心 12 樓',
    privacy: '私隱政策',
    copy: '© 2026 晴光牙科醫務中心',
    credit: '相片：Kaboompics、Cedric Fauntleroy / Pexels',
  },
};

export default zhHK;
export type Copy = typeof zhHK;
