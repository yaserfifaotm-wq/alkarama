// ==========================================
// 🛠️ إعدادات قاعدة بيانات Firebase السحابية
// تم ربط النظام تلقائياً بقاعدة البيانات السحابية الخاصة بمركز الكرامة
// ==========================================
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAzcdGysfXckd2F0-ZSLZZkDbHnvo6VOPs",
    authDomain: "alkaramma-2da56.firebaseapp.com",
    databaseURL: "https://alkaramma-2da56-default-rtdb.firebaseio.com",
    projectId: "alkaramma-2da56",
    storageBucket: "alkaramma-2da56.firebasestorage.app",
    messagingSenderId: "1067610452745",
    appId: "1:1067610452745:web:ad1a75ce5bb2c3f2cb19d8",
    measurementId: "G-LFKYZCB57V"
};
// ==========================================

// --- STATE MANAGEMENT ---
let appState = {
    bookings: {}, // الهيكل: { "YYYY-MM-DD": [ { id, name, dept, notes, timestamp } ] }
    selectedDate: null, // التاريخ المختار حالياً صيغة "YYYY-MM-DD"
    currentMonth: new Date().getMonth(), // الشهر المعروض حالياً في التقويم
    currentYear: new Date().getFullYear(), // السنة المعروضة حالياً في التقويم
    dbMode: 'local', // ستتغير تلقائياً إلى 'firebase' إذا تم تعبئة البيانات أعلاه
    firebaseConfig: { ...FIREBASE_CONFIG },
    adminPasscode: '1234', // الرمز الافتراضي لحذف الإجازات (المسؤول)
    disableTimeRestrictions: false, // لتعطيل قيود وقت الحجز للمسؤول
    isFirebaseInitialized: false,
    dbRef: null // مرجع قاعدة بيانات Firebase
};

// أسماء الأيام العربية للمطابقة
const ARABIC_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const ARABIC_MONTHS = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    initApp();
    setupEventListeners();
});

// تهيئة التطبيق
function initApp() {
    // تحديد التاريخ الافتراضي (اليوم إذا كان بين الأحد والأربعاء، وإلا الأحد القادم)
    const today = new Date();
    const todayStr = formatDateToString(today);
    
    if (isValidBookingDay(today)) {
        appState.selectedDate = todayStr;
    } else {
        // البحث عن أقرب يوم حجز قادم (الأحد القادم)
        const nextSunday = getNextSunday(today);
        appState.selectedDate = formatDateToString(nextSunday);
        appState.currentMonth = nextSunday.getMonth();
        appState.currentYear = nextSunday.getFullYear();
    }

    // إعداد واجهة قاعدة البيانات بناءً على الوضع
    updateDbStatusBadge();

    if (appState.dbMode === 'firebase' && validateFirebaseConfig(appState.firebaseConfig)) {
        initializeFirebase();
    } else {
        // استخدام التخزين المحلي
        loadLocalBookings();
        refreshUI();
    }
}

// إعداد مستمعي الأحداث للأزرار والنموذج
function setupEventListeners() {
    document.getElementById("prev-month-btn").addEventListener("click", () => {
        navigateMonth(-1);
    });

    document.getElementById("next-month-btn").addEventListener("click", () => {
        navigateMonth(1);
    });

    // مراقبة تغيير وضع قاعدة البيانات لتفعيل/تعطيل الحقول في الإعدادات
    const dbRadios = document.querySelectorAll('input[name="db_mode"]');
    dbRadios.forEach(radio => {
        radio.addEventListener("change", (e) => {
            const fields = document.getElementById("firebase-config-fields");
            if (e.target.value === "firebase") {
                fields.classList.remove("d-none");
            } else {
                fields.classList.add("d-none");
            }
        });
    });
}

// --- DATE HELPER FUNCTIONS ---

// تحويل كائن التاريخ إلى نص "YYYY-MM-DD" مع مراعاة فرق التوقيت المحلي
function formatDateToString(date) {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
}

// التحقق هل اليوم متاح للحجز (من الأحد إلى الأربعاء)
// Sunday = 0, Monday = 1, Tuesday = 2, Wednesday = 3, Thursday = 4, Friday = 5, Saturday = 6
function isValidBookingDay(date) {
    const day = date.getDay();
    return day >= 0 && day <= 3; // 0, 1, 2, 3 (الأحد، الاثنين، الثلاثاء، الأربعاء)
}

// فحص هل الحجز مفتوح حالياً لتاريخ معين (يفتح قبل بيوم الساعة 8:00 صباحاً ويغلق بنهاية اليوم المختار)
function isBookingWindowOpen(targetDateStr, now) {
    if (appState.disableTimeRestrictions) {
        return { isOpen: true, status: 'open' };
    }
    
    const targetDate = new Date(targetDateStr);
    
    // حساب تاريخ ووقت فتح الحجز (اليوم السابق الساعة 8:00 صباحاً)
    const openTime = new Date(targetDate.getTime());
    openTime.setDate(openTime.getDate() - 1);
    openTime.setHours(8, 0, 0, 0);
    
    // وقت انتهاء الحجز (نهاية اليوم المختار)
    const closeTime = new Date(targetDate.getTime());
    closeTime.setHours(23, 59, 59, 999);
    
    if (now < openTime) {
        return { isOpen: false, status: 'upcoming', openTime: openTime };
    }
    if (now > closeTime) {
        return { isOpen: false, status: 'expired' };
    }
    
    return { isOpen: true, status: 'open' };
}

// توحيد وتنظيف الأسماء العربية لضمان دقة المقارنة وتجنب التحايل بالاختلافات الإملائية
function normalizeArabicName(name) {
    if (!name) return "";
    return name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")                       // دمج المسافات المتكررة
        .replace(/[أإآ]/g, "ا")                     // توحيد الألف
        .replace(/ة/g, "ه")                         // توحيد التاء المربوطة
        .replace(/ى/g, "ي")                         // توحيد الياء
        .replace(/[ًٌٍَُِّّْ]/g, "");                 // حذف التشكيل إن وجد
}

// حساب عدد إجازات موظف معين في شهر وسنة محددين
function getEmployeeMonthlyBookingsCount(employeeName, yearMonthStr) {
    const normalizedTargetName = normalizeArabicName(employeeName);
    let count = 0;
    
    for (const dateKey in appState.bookings) {
        if (dateKey.startsWith(yearMonthStr)) {
            const dayBookings = appState.bookings[dateKey] || [];
            dayBookings.forEach(booking => {
                if (normalizeArabicName(booking.name) === normalizedTargetName) {
                    count++;
                }
            });
        }
    }
    
    return count;
}

// الحصول على تاريخ الأحد القادم
function getNextSunday(date) {
    const resultDate = new Date(date);
    const day = resultDate.getDay();
    const steps = day === 0 ? 0 : 7 - day; // إذا كان اليوم هو الأحد بالفعل
    resultDate.setDate(resultDate.getDate() + (day === 4 || day === 5 || day === 6 ? (7 - day) : steps));
    // للتسهيل: نقوم بإضافة الأيام حتى نصل للأحد
    while (resultDate.getDay() !== 0) {
        resultDate.setDate(resultDate.getDate() + 1);
    }
    return resultDate;
}

// تنسيق التاريخ للقرائة البشرية بالعربية
function formatArabicFullDate(dateStr) {
    const date = new Date(dateStr);
    const dayName = ARABIC_DAYS[date.getDay()];
    const dayNum = date.getDate();
    const monthName = ARABIC_MONTHS[date.getMonth()];
    const yearNum = date.getFullYear();
    return `${dayName}، ${dayNum} ${monthName} ${yearNum}`;
}

// تنسيق الوقت
function formatTime(timestamp) {
    const date = new Date(timestamp);
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'مساءً' : 'صباحاً';
    hours = hours % 12;
    hours = hours ? hours : 12; // الساعة 0 تصبح 12
    return `${hours}:${minutes} ${ampm}`;
}

// --- DATABASE CONNECTORS (LOCAL & FIREBASE) ---

// شحن الحجوزات من LocalStorage
function loadLocalBookings() {
    const localData = localStorage.getItem("alkarama_bookings");
    if (localData) {
        try {
            appState.bookings = JSON.parse(localData);
        } catch (e) {
            console.error("خطأ في قراءة البيانات المحلية", e);
            appState.bookings = {};
        }
    } else {
        appState.bookings = {};
    }
}

// حفظ الحجوزات محلياً
function saveLocalBookings() {
    localStorage.setItem("alkarama_bookings", JSON.stringify(appState.bookings));
}

// تهيئة اتصال Firebase
function initializeFirebase() {
    if (appState.isFirebaseInitialized) {
        // إذا كان مهيأ مسبقاً، نقوم فقط بإعادة تعيين المستمعين
        attachFirebaseListeners();
        return;
    }

    try {
        // التحقق من وجود مكتبة Firebase محملة
        if (typeof firebase === 'undefined') {
            throw new Error("مكتبة Firebase غير متصلة بالإنترنت حالياً.");
        }

        // تهيئة التطبيق
        firebase.initializeApp(appState.firebaseConfig);
        appState.isFirebaseInitialized = true;
        appState.dbRef = firebase.database().ref("bookings");
        
        updateDbStatusBadge("cloud");
        attachFirebaseListeners();
    } catch (error) {
        console.error("فشل تهيئة Firebase:", error);
        updateDbStatusBadge("error");
        // التراجع للوضع المحلي لتجنب توقف التطبيق
        appState.dbMode = 'local';
        loadLocalBookings();
        refreshUI();
        alert("فشل الاتصال بسحابة Firebase. تم تحويل النظام تلقائياً لوضع التجربة المحلية لحين إصلاح الإعدادات. السبب: " + error.message);
    }
}

// ربط مستمعين لقراءة التحديثات الفورية من Firebase
function attachFirebaseListeners() {
    if (!appState.dbRef) return;

    // إلغاء أي مستمعين سابقين لمنع التكرار
    appState.dbRef.off();

    // سماع التحديثات
    appState.dbRef.on("value", (snapshot) => {
        const val = snapshot.val();
        appState.bookings = val || {};
        refreshUI();
    }, (error) => {
        console.error("خطأ في مزامنة Firebase:", error);
        updateDbStatusBadge("error");
    });
}

// تحديث شارة حالة قاعدة البيانات في أعلى الصفحة
function updateDbStatusBadge(overrideStatus) {
    const badge = document.getElementById("db-status-badge");
    const textSpan = badge.querySelector(".status-text");
    
    badge.className = "db-status"; // إعادة ضبط الكلاسات
    
    const currentMode = overrideStatus || appState.dbMode;

    if (currentMode === "cloud") {
        badge.classList.add("cloud-mode");
        textSpan.textContent = "سحابي مشترك (نشط)";
    } else if (currentMode === "error") {
        badge.classList.add("error-mode");
        textSpan.textContent = "خطأ في الاتصال بالسحابة";
    } else {
        badge.classList.add("demo-mode");
        textSpan.textContent = "وضع تجريبي محلي";
    }
}

// --- SETTINGS MANAGEMENT (SAVE/LOAD) ---

// تحميل الإعدادات من LocalStorage
function loadSettings() {
    // التحقق هل تم إدخال إعدادات Firebase مباشرة في الكود
    const isHardcodedFirebase = FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey.trim() !== "";
    
    if (isHardcodedFirebase) {
        appState.dbMode = 'firebase';
        appState.firebaseConfig = { ...FIREBASE_CONFIG };
    }

    const settings = localStorage.getItem("alkarama_settings");
    if (settings) {
        try {
            const parsed = JSON.parse(settings);
            // إذا لم تكن هناك إعدادات صلبة بالكود، نأخذ الإعدادات المخزنة محلياً بالمتصفح
            if (!isHardcodedFirebase) {
                appState.dbMode = parsed.dbMode || 'local';
                appState.firebaseConfig = parsed.firebaseConfig || appState.firebaseConfig;
            }
            appState.adminPasscode = parsed.adminPasscode || '1234';
            appState.disableTimeRestrictions = parsed.disableTimeRestrictions || false;
        } catch (e) {
            console.error("خطأ في تحميل الإعدادات", e);
        }
    }
}

// حفظ الإعدادات وتطبيقها
function saveSettings() {
    const settings = {
        dbMode: appState.dbMode,
        firebaseConfig: appState.firebaseConfig,
        adminPasscode: appState.adminPasscode,
        disableTimeRestrictions: appState.disableTimeRestrictions
    };
    localStorage.setItem("alkarama_settings", JSON.stringify(settings));
}

// التحقق من صحة إعدادات كود الفايربيز
function validateFirebaseConfig(config) {
    return config && config.apiKey && config.databaseURL && config.projectId;
}

// فتح نافذة الإعدادات وتعبئة البيانات
function openSettingsModal() {
    const password = prompt("يرجى إدخال رمز مرور المسؤول لفتح إعدادات النظام:");
    if (password === null) return; // تم إلغاء العملية
    
    if (password !== appState.adminPasscode) {
        alert("رمز مرور المسؤول غير صحيح. تم رفض الدخول.");
        return;
    }

    // تعبئة البيانات
    document.getElementById("admin-passcode").value = appState.adminPasscode || '1234';
    document.getElementById("disable-time-restrictions").checked = appState.disableTimeRestrictions || false;

    document.getElementById("settings-modal").classList.remove("d-none");
}

// إغلاق نافذة الإعدادات
function closeSettingsModal() {
    document.getElementById("settings-modal").classList.add("d-none");
}

// حفظ الإعدادات من النموذج
function saveSystemSettings() {
    const passcode = document.getElementById("admin-passcode").value.trim() || '1234';
    const disableRestrictions = document.getElementById("disable-time-restrictions").checked;

    appState.adminPasscode = passcode;
    appState.disableTimeRestrictions = disableRestrictions;
    
    saveSettings();
    closeSettingsModal();

    // إعادة تهيئة التطبيق بالوضع الجديد
    initApp();
}

// التبديل بين تبويبات نافذة الإعدادات
function switchTab(tabId, event) {
    // إخفاء المحتوى الحالي
    const contents = document.querySelectorAll(".tab-content");
    contents.forEach(c => c.classList.add("d-none"));
    
    // تفعيل التبويب المختار
    document.getElementById(tabId).classList.remove("d-none");

    // تغيير شكل الأزرار
    const buttons = document.querySelectorAll(".tab-btn");
    buttons.forEach(b => b.classList.remove("active"));
    event.target.classList.add("active");
}

// --- CALENDAR RENDERING LOGIC ---

// التنقل بين الأشهر
function navigateMonth(direction) {
    appState.currentMonth += direction;
    if (appState.currentMonth < 0) {
        appState.currentMonth = 11;
        appState.currentYear -= 1;
    } else if (appState.currentMonth > 11) {
        appState.currentMonth = 0;
        appState.currentYear += 1;
    }
    renderCalendar();
}

// رسم التقويم
function renderCalendar() {
    const gridContainer = document.getElementById("calendar-days-grid");
    gridContainer.innerHTML = ""; // تفريغ الخلايا السابقة

    // تعيين عرض الشهر الحالي
    document.getElementById("month-year-display").textContent = `${ARABIC_MONTHS[appState.currentMonth]} ${appState.currentYear}`;

    // اليوم الأول في الشهر
    const firstDay = new Date(appState.currentYear, appState.currentMonth, 1);
    // عدد الأيام في الشهر
    const daysInMonth = new Date(appState.currentYear, appState.currentMonth + 1, 0).getDate();
    
    // يوم البدء للأسبوع (0: الأحد، 1: الاثنين ... إلخ)
    let startDayOfWeek = firstDay.getDay();

    // حشو الخلايا الفارغة قبل بداية الشهر
    for (let i = 0; i < startDayOfWeek; i++) {
        const emptyCell = document.createElement("div");
        emptyCell.className = "day-cell day-empty-pad";
        gridContainer.appendChild(emptyCell);
    }

    // توليد أيام الشهر
    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(appState.currentYear, appState.currentMonth, day);
        const dateStr = formatDateToString(dateObj);
        const dayOfWeek = dateObj.getDay();

        const cell = document.createElement("div");
        cell.className = "day-cell";
        
        // رقم اليوم
        const numSpan = document.createElement("span");
        numSpan.className = "day-num";
        numSpan.textContent = day;
        cell.appendChild(numSpan);

        // التحقق من حالة اليوم
        const isClosed = !isValidBookingDay(dateObj);
        const dayBookings = appState.bookings[dateStr] || [];
        const bookingsCount = dayBookings.length;

        if (isClosed) {
            // يوم مغلق (الخميس، الجمعة، السبت)
            cell.classList.add("day-closed");
            
            const lockIcon = document.createElement("span");
            lockIcon.className = "day-status-indicator";
            lockIcon.innerHTML = `<i class="fa-solid fa-lock" style="font-size: 8px;"></i> مغلق`;
            cell.appendChild(lockIcon);
        } else {
            // يوم متاح (الأحد - الأربعاء)
            cell.classList.add("day-open");

            if (bookingsCount >= 8) {
                cell.classList.remove("day-open");
                cell.classList.add("day-full");
            } else if (bookingsCount > 0) {
                cell.classList.add("day-partial");
            }

            // مستمع للضغط لاختيار اليوم
            cell.addEventListener("click", () => {
                selectDate(dateStr);
            });

            // مؤشر السعة والدوائر الملونة
            const footerContainer = document.createElement("div");
            footerContainer.style.display = "flex";
            footerContainer.style.alignItems = "center";
            footerContainer.style.justifyContent = "space-between";
            footerContainer.style.width = "100%";
            footerContainer.style.marginTop = "auto";

            // نقطة ملونة
            const dot = document.createElement("span");
            dot.className = "day-slots-dot";
            footerContainer.appendChild(dot);

            // النص الرقمي
            const slotsCount = document.createElement("span");
            slotsCount.className = "day-slots-count";
            
            if (bookingsCount >= 8) {
                slotsCount.innerHTML = `<span class="slots-num">مكتمل</span>`;
            } else {
                slotsCount.innerHTML = `<span class="slots-num">${8 - bookingsCount}</span><span class="slots-label"> شاغر</span>`;
            }
            
            footerContainer.appendChild(slotsCount);
            cell.appendChild(footerContainer);
        }

        // تمييز اليوم المختار
        if (dateStr === appState.selectedDate) {
            cell.classList.add("selected");
        }

        gridContainer.appendChild(cell);
    }
}

// اختيار تاريخ معين لتفاصيله
function selectDate(dateStr) {
    appState.selectedDate = dateStr;
    
    // تحديث التحديد في التقويم
    const cells = document.querySelectorAll(".day-cell");
    cells.forEach(c => c.classList.remove("selected"));
    
    renderCalendar(); // لإعادة التلوين وتفعيل كلاس .selected
    renderDayDetails();

    // التمرير التلقائي لنموذج الحجز في الهواتف لسهولة الاستخدام
    if (window.innerWidth <= 900) {
        setTimeout(() => {
            const el = document.getElementById("details-wrapper-container");
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 100);
    }
}

// --- DAY DETAILS & BOOKINGS RENDER ---

// تحديث لوحة تفاصيل اليوم والحجوزات والنموذج
function renderDayDetails() {
    const noSelectState = document.getElementById("no-day-selected-state");
    const detailsContainer = document.getElementById("day-details-container");
    
    if (!appState.selectedDate) {
        noSelectState.classList.remove("d-none");
        detailsContainer.classList.add("d-none");
        return;
    }

    noSelectState.classList.add("d-none");
    detailsContainer.classList.remove("d-none");

    const dateObj = new Date(appState.selectedDate);
    const isClosed = !isValidBookingDay(dateObj);
    
    // تحديث العنوان الرئيسي لليوم المختار
    document.getElementById("selected-day-title").textContent = formatArabicFullDate(appState.selectedDate);

    const blockedMessage = document.getElementById("day-blocked-message");
    const activeContent = document.getElementById("day-active-content");

    if (isClosed) {
        blockedMessage.classList.remove("d-none");
        activeContent.classList.add("d-none");
        return;
    }

    blockedMessage.classList.add("d-none");
    activeContent.classList.remove("d-none");

    // حساب الحجوزات والسعة
    const dayBookings = appState.bookings[appState.selectedDate] || [];
    const count = dayBookings.length;
    const remaining = 8 - count;

    // تحديث شريط التقدم والنص
    document.getElementById("slots-count-text").textContent = `الشاغر: ${remaining} / 8`;
    const progressFill = document.getElementById("slots-progress-fill");
    const percentage = (count / 8) * 100;
    progressFill.style.width = `${percentage}%`;

    // لو كان مكتمل، يتم تغيير لون الشريط للأحمر، وإلا الأخضر
    if (count >= 8) {
        progressFill.style.background = "var(--danger-gradient)";
    } else {
        progressFill.style.background = "var(--success-gradient)";
    }

    // إظهار/إخفاء نموذج الحجز بناءً على السعة وقيود الوقت
    const formWrapper = document.getElementById("booking-form-wrapper");
    const fullMessage = document.getElementById("day-full-message");
    const closedWindowMessage = document.getElementById("booking-window-closed-message");
    const closedWindowText = document.getElementById("booking-window-closed-text");

    // التحقق من قيود الوقت
    const now = new Date();
    const windowStatus = isBookingWindowOpen(appState.selectedDate, now);

    // إخفاء كافة التنبيهات والنموذج بشكل افتراضي
    formWrapper.classList.add("d-none");
    fullMessage.classList.add("d-none");
    closedWindowMessage.classList.add("d-none");

    if (!windowStatus.isOpen) {
        // خارج وقت الحجز المسموح به لهذا اليوم
        closedWindowMessage.classList.remove("d-none");
        
        // تخصيص رسالة التنبيه بناءً على الحالة واليوم المختار
        const selectedDayOfWeek = dateObj.getDay();
        let dayName = "";
        let prevDayName = "";
        
        if (selectedDayOfWeek === 0) { dayName = "الأحد"; prevDayName = "السبت"; }
        else if (selectedDayOfWeek === 1) { dayName = "الاثنين"; prevDayName = "الأحد"; }
        else if (selectedDayOfWeek === 2) { dayName = "الثلاثاء"; prevDayName = "الاثنين"; }
        else if (selectedDayOfWeek === 3) { dayName = "الأربعاء"; prevDayName = "الثلاثاء"; }
        
        if (windowStatus.status === 'upcoming') {
            closedWindowText.textContent = `حجز إجازات يوم ${dayName} يفتح يوم ${prevDayName} في تمام الساعة 8:00 صباحاً.`;
        } else if (windowStatus.status === 'expired') {
            closedWindowText.textContent = `عذراً، حجز إجازات يوم ${dayName} مغلق لأن هذا اليوم قد مضى وانتهى.`;
        } else {
            closedWindowText.textContent = "حجز إجازات هذا اليوم مغلق حالياً.";
        }
    } else {
        // وقت الحجز متاح
        if (count >= 8) {
            fullMessage.classList.remove("d-none");
        } else {
            formWrapper.classList.remove("d-none");
            
            // مسح بيانات الحقل المدخلة مسبقاً تسهيلاً للمستخدم التالي
            document.getElementById("employee-name").value = "";
            document.getElementById("employee-dept").value = "";
            document.getElementById("booking-notes").value = "";
        }
    }

    // تحديث شارة العدد بقائمة المسجلين
    document.getElementById("registered-badge-count").textContent = `${count} / 8`;

    // رسم قائمة المحجوزين
    renderBookingsList(dayBookings);
}

// رسم أسماء المسجلين في اليوم المختار مرتبين حسب الأسبقية
function renderBookingsList(bookings) {
    const listElement = document.getElementById("bookings-list");
    const placeholder = document.getElementById("no-bookings-placeholder");

    listElement.innerHTML = "";

    if (bookings.length === 0) {
        placeholder.classList.remove("d-none");
        listElement.classList.add("d-none");
        return;
    }

    placeholder.classList.add("d-none");
    listElement.classList.remove("d-none");

    // ترتيب الحجوزات حسب وقت التسجيل (الأقدم للأحدث لضمان الأسبقية)
    const sortedBookings = [...bookings].sort((a, b) => a.timestamp - b.timestamp);

    sortedBookings.forEach((booking, index) => {
        const li = document.createElement("li");
        li.className = "booking-item";
        
        let notesHTML = "";
        if (booking.notes) {
            notesHTML = `<span class="booking-notes-content"><i class="fa-solid fa-note-sticky"></i> ${booking.notes}</span>`;
        }

        li.innerHTML = `
            <div class="booking-main-info">
                <span class="booking-emp-name">${escapeHTML(booking.name)}</span>
                <div class="booking-sub-row">
                    <span class="booking-dept"><i class="fa-solid fa-building"></i> القسم: ${booking.department}</span>
                    <span class="booking-time"><i class="fa-regular fa-clock"></i> التسجيل: ${formatTime(booking.timestamp)}</span>
                </div>
                ${notesHTML}
            </div>
            <button class="delete-booking-btn" onclick="handleDeleteBooking('${booking.id}', '${escapeHTML(booking.name)}')" title="حذف حجز الموظف">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;
        listElement.appendChild(li);
    });
}

// --- BOOKING OPERATIONS (CREATE & DELETE) ---

// إرسال الحجز الجديد
function handleBookingSubmit(event) {
    event.preventDefault();

    const nameInput = document.getElementById("employee-name");
    const deptInput = document.getElementById("employee-dept");
    const notesInput = document.getElementById("booking-notes");

    const name = nameInput.value.trim();
    const department = deptInput.value;
    const notes = notesInput.value.trim();

    if (!name || !department) {
        alert("يرجى ملء الحقول الإلزامية الاسم والقسم.");
        return;
    }

    // التحقق مجدداً من اليوم المحدد وقيود الوقت
    const targetDate = appState.selectedDate;
    if (!targetDate) return;

    const dateObj = new Date(targetDate);
    if (!isValidBookingDay(dateObj)) {
        alert("الحجز غير متاح في اليوم المحدد.");
        return;
    }

    const now = new Date();
    const windowStatus = isBookingWindowOpen(targetDate, now);
    if (!windowStatus.isOpen) {
        alert("عذراً! الحجز غير متاح حالياً لهذا اليوم (تأكد من وقت فتح وإغلاق الحجز).");
        return;
    }

    // التحقق من الحد الأقصى للإجازات شهرياً للموظف (3 إجازات كحد أقصى)
    const yearMonthStr = targetDate.substring(0, 7); // YYYY-MM
    const monthlyCount = getEmployeeMonthlyBookingsCount(name, yearMonthStr);
    if (!appState.disableTimeRestrictions && monthlyCount >= 3) {
        const arabicMonthName = ARABIC_MONTHS[dateObj.getMonth()];
        alert(`عذراً! الموظف (${name}) لديه بالفعل ${monthlyCount} إجازات مسجلة في شهر ${arabicMonthName}. الحد الأقصى المسموح به هو 3 إجازات شهرياً.`);
        return;
    }

    // إنشاء كائن الحجز
    const newBooking = {
        id: generateUniqueId(),
        name: name,
        department: department,
        notes: notes,
        timestamp: Date.now()
    };

    // تعطيل زر الحجز لمنع النقرات المتكررة
    const submitBtn = document.getElementById("submit-booking-btn");
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري التسجيل...`;

    if (appState.dbMode === 'firebase' && appState.isFirebaseInitialized && appState.dbRef) {
        // تنفيذ الحجز الآمن عبر Transactions في Firebase لضمان عدم تجاوز الـ 8 حتى لو تسجلوا بالملي ثانية
        const dayRef = appState.dbRef.child(targetDate);
        
        dayRef.transaction((currentBookings) => {
            currentBookings = currentBookings || [];
            
            if (currentBookings.length >= 8) {
                // اليوم ممتلئ، نلغي العملية
                return; 
            }
            
            // إضافة الحجز الجديد
            currentBookings.push(newBooking);
            return currentBookings;
        }, (error, committed, snapshot) => {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> تأكيد الحجز الآن`;

            if (error) {
                console.error("فشل الحجز السحابي:", error);
                alert("حدث خطأ أثناء الاتصال بقاعدة البيانات. يرجى المحاولة لاحقاً.");
            } else if (!committed) {
                alert("عذراً! تم حجز المقاعد الثمانية الأخيرة لهذا اليوم قبل قليل من قبل موظف آخر.");
            } else {
                // نجاح الحجز
                nameInput.value = "";
                notesInput.value = "";
                deptInput.value = "";
            }
        });
    } else {
        // الحفظ المحلي
        setTimeout(() => { // وهمي ليشعر بالثقة
            const currentBookings = appState.bookings[targetDate] || [];
            
            if (currentBookings.length >= 8) {
                alert("عذراً، هذا اليوم ممتلئ بالفعل.");
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> تأكيد الحجز الآن`;
                return;
            }

            currentBookings.push(newBooking);
            appState.bookings[targetDate] = currentBookings;
            
            saveLocalBookings();
            refreshUI();

            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> تأكيد الحجز الآن`;

            // تفريغ المدخلات
            nameInput.value = "";
            notesInput.value = "";
            deptInput.value = "";
        }, 300);
    }
}

// طلب الحذف والتحقق من كلمة المرور
function handleDeleteBooking(bookingId, employeeName) {
    const password = prompt(`لحذف حجز الموظف (${employeeName})، يرجى إدخال رمز مرور المسؤول:`);
    
    if (password === null) return; // تم الإلغاء

    if (password !== appState.adminPasscode) {
        alert("رمز مرور المسؤول غير صحيح. تم رفض العملية.");
        return;
    }

    const targetDate = appState.selectedDate;
    if (!targetDate) return;

    if (appState.dbMode === 'firebase' && appState.isFirebaseInitialized && appState.dbRef) {
        // حذف سحابي
        const dayRef = appState.dbRef.child(targetDate);
        
        dayRef.transaction((currentBookings) => {
            if (!currentBookings) return;
            // تصفية الحجوزات لاستبعاد المختار
            return currentBookings.filter(b => b.id !== bookingId);
        }, (error, committed) => {
            if (error) {
                alert("خطأ في حذف الحجز سحابياً.");
            } else if (committed) {
                // تم الحذف
            }
        });
    } else {
        // حذف محلي
        const currentBookings = appState.bookings[targetDate] || [];
        appState.bookings[targetDate] = currentBookings.filter(b => b.id !== bookingId);
        
        saveLocalBookings();
        refreshUI();
    }
}

// تحديث كامل للواجهة
function refreshUI() {
    renderCalendar();
    renderDayDetails();
}

// توليد معرف عشوائي فريد لكل حجز
function generateUniqueId() {
    return 'b_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

// حماية حقن الأكواد الضارة
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// --- ADMIN SYSTEM TOOLS (BACKUP & RESTORE) ---

// مسح كافة الحجوزات من النظام
function clearAllData() {
    const check1 = confirm("⚠️ تحذير شديد! هل أنت متأكد تماماً من رغبتك في حذف كااااافة الحجوزات المسجلة بجميع الأيام نهائياً؟ لا يمكن التراجع!");
    if (!check1) return;

    const password = prompt("يرجى إدخال رمز مرور المسؤول للتأكيد النهائي:");
    if (password !== appState.adminPasscode) {
        alert("رمز مرور المسؤول غير صحيح. تم إلغاء العملية.");
        return;
    }

    if (appState.dbMode === 'firebase' && appState.isFirebaseInitialized && appState.dbRef) {
        appState.dbRef.set(null, (error) => {
            if (error) {
                alert("خطأ في مسح البيانات من Firebase.");
            } else {
                alert("تم تفريغ قاعدة البيانات السحابية بالكامل.");
            }
        });
    } else {
        appState.bookings = {};
        saveLocalBookings();
        refreshUI();
        alert("تم مسح كافة البيانات المحلية بنجاح.");
    }
}

// تصدير نسخة احتياطية كملف JSON
function exportDataBackup() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState.bookings, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    
    const today = new Date().toISOString().split('T')[0];
    downloadAnchor.setAttribute("download", `backup_alkarama_bookings_${today}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

// فتح اختيار الملف للاستيراد
function triggerImportFileInput() {
    document.getElementById("import-file-input").click();
}

// استيراد بيانات احتياطية من ملف
function importDataBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            // تحقق بسيط من بنية البيانات
            if (typeof importedData !== 'object') {
                throw new Error("تنسيق الملف غير صالح.");
            }

            const confirmImport = confirm("سيتم دمج البيانات المستوردة مع البيانات الحالية. هل ترغب في المتابعة؟");
            if (!confirmImport) return;

            // دمج البيانات
            for (let dateKey in importedData) {
                if (Array.isArray(importedData[dateKey])) {
                    // للتأكد من عدم التكرار بالـ ID
                    const existingBookings = appState.bookings[dateKey] || [];
                    const newBookings = importedData[dateKey];
                    
                    newBookings.forEach(newB => {
                        if (!existingBookings.some(exB => exB.id === newB.id)) {
                            // إضافة الحجز إذا كان غير موجود
                            existingBookings.push(newB);
                        }
                    });
                    
                    // قص الزيادة عن 8 في حال وجد خطأ دمج
                    appState.bookings[dateKey] = existingBookings.slice(0, 8);
                }
            }

            if (appState.dbMode === 'firebase' && appState.isFirebaseInitialized && appState.dbRef) {
                appState.dbRef.set(appState.bookings, (error) => {
                    if (error) {
                        alert("خطأ في رفع البيانات المستوردة إلى Firebase.");
                    } else {
                        alert("تم استيراد البيانات ومزامنتها سحابياً بنجاح.");
                    }
                });
            } else {
                saveLocalBookings();
                refreshUI();
                alert("تم استيراد البيانات المحلية بنجاح.");
            }

        } catch (err) {
            alert("فشل قراءة الملف. تأكد من أنه ملف نسخة احتياطية صالح للمركز. السبب: " + err.message);
        }
    };
    reader.readAsText(file);
    // تصفير مدخل الملف ليسمح باختيار نفس الملف مجدداً
    event.target.value = "";
}

// طباعة كشف اليوم المختار
function printSelectedDayReport() {
    const targetDate = appState.selectedDate;
    if (!targetDate) {
        alert("يرجى اختيار يوم لطباعته أولاً.");
        return;
    }

    const dayBookings = appState.bookings[targetDate] || [];
    if (dayBookings.length === 0) {
        alert("لا يمكن طباعة كشف فارغ. لا يوجد حجوزات مسجلة لهذا اليوم بعد.");
        return;
    }

    // ترتيب المحجوزين بالأسبقية
    const sorted = [...dayBookings].sort((a, b) => a.timestamp - b.timestamp);

    // تحديث ترويسة الطباعة
    document.getElementById("print-date").textContent = `التاريخ: ${formatArabicFullDate(targetDate)}`;

    // تفريغ وتعبئة الجدول
    const tableBody = document.getElementById("print-table-body");
    tableBody.innerHTML = "";

    sorted.forEach((booking, index) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td style="text-align: center; font-weight: bold;">${index + 1}</td>
            <td>${escapeHTML(booking.name)}</td>
            <td>${booking.department}</td>
            <td>${formatTime(booking.timestamp)}</td>
        `;
        tableBody.appendChild(row);
    });

    // فتح نافذة طباعة المتصفح
    window.print();
}
