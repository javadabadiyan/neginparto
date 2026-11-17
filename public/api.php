<?php
declare(strict_types=1);

error_reporting(0);
@ini_set('display_errors', '0');

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

define('DATA_DIR', __DIR__ . DIRECTORY_SEPARATOR . 'hr-data');
define('BACKUP_DIR', DATA_DIR . DIRECTORY_SEPARATOR . 'backups');
define('DB_FILE', DATA_DIR . DIRECTORY_SEPARATOR . 'hr_database.json');
define('LOCK_FILE', DATA_DIR . DIRECTORY_SEPARATOR . '.db.lock');
define('SECRET_FILE', DATA_DIR . DIRECTORY_SEPARATOR . '.server_secret');
define('FIREBASE_PROJECT_ID', 'modern-xyston-gv0ns');
define('FIREBASE_DB_ID', 'ai-studio-b445490f-35ad-4b58-ad86-c952f46a7166');

function jsonResponse(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ensureStorageReady(): void {
    if (!is_dir(DATA_DIR)) {
        @mkdir(DATA_DIR, 0755, true);
    }
    if (!is_dir(BACKUP_DIR)) {
        @mkdir(BACKUP_DIR, 0755, true);
    }
    $htaccessPath = DATA_DIR . DIRECTORY_SEPARATOR . '.htaccess';
    if (!file_exists($htaccessPath)) {
        $htaccess = "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n";
        @file_put_contents($htaccessPath, $htaccess);
    }
    $indexPhpPath = DATA_DIR . DIRECTORY_SEPARATOR . 'index.php';
    if (!file_exists($indexPhpPath)) {
        @file_put_contents($indexPhpPath, "<?php http_response_code(403); exit; ?>\n");
    }
    $webConfigPath = DATA_DIR . DIRECTORY_SEPARATOR . 'web.config';
    if (!file_exists($webConfigPath)) {
        $webConfig = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<configuration>\n  <system.webServer>\n    <authorization>\n      <deny users=\"*\" />\n    </authorization>\n  </system.webServer>\n</configuration>\n";
        @file_put_contents($webConfigPath, $webConfig);
    }
}

ensureStorageReady();

function getServerSecret(): string {
    if (file_exists(SECRET_FILE)) {
        $existing = trim((string)@file_get_contents(SECRET_FILE));
        if (strlen($existing) >= 32) {
            return $existing;
        }
    }
    $generated = bin2hex(random_bytes(48));
    @file_put_contents(SECRET_FILE, $generated);
    @chmod(SECRET_FILE, 0600);
    return $generated;
}

$SERVER_SECRET = getServerSecret();

function startsWith(string $haystack, string $needle): bool {
    return $needle === '' || strncmp($haystack, $needle, strlen($needle)) === 0;
}

function containsStr(string $haystack, string $needle): bool {
    return $needle === '' || strpos($haystack, $needle) !== false;
}

function base64UrlEncode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64UrlDecode(string $data) {
    $remainder = strlen($data) % 4;
    if ($remainder) {
        $data .= str_repeat('=', 4 - $remainder);
    }
    return base64_decode(strtr($data, '-_', '+/'), true);
}

function hashPasswordPhp(string $plain): string {
    return password_hash($plain, PASSWORD_BCRYPT);
}

function verifyPasswordPhp(string $plain, string $stored): array {
    if ($stored === '') {
        return ['valid' => false, 'needsMigration' => false];
    }
    if (startsWith($stored, '$2y$') || startsWith($stored, '$2a$') || startsWith($stored, '$2b$') || startsWith($stored, '$argon2')) {
        return ['valid' => password_verify($plain, $stored), 'needsMigration' => false];
    }
    if (!startsWith($stored, 'scrypt$')) {
        $match = hash_equals($stored, $plain);
        return ['valid' => $match, 'needsMigration' => $match];
    }
    return ['valid' => false, 'needsMigration' => false];
}

function createAuthToken(array $user, string $secret): string {
    $nowMs = (int)round(microtime(true) * 1000);
    $payload = [
        'uid' => $user['id'],
        'usr' => $user['username'],
        'iat' => $nowMs,
        'exp' => $nowMs + (7 * 24 * 60 * 60 * 1000),
    ];
    $encoded = base64UrlEncode((string)json_encode($payload, JSON_UNESCAPED_UNICODE));
    $sig = base64UrlEncode(hash_hmac('sha256', $encoded, $secret, true));
    return $encoded . '.' . $sig;
}

function verifyAuthToken(string $token, string $secret): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 2) return null;
    [$encoded, $sig] = $parts;
    $expected = base64UrlEncode(hash_hmac('sha256', $encoded, $secret, true));
    if (!hash_equals($expected, $sig)) return null;
    $decoded = base64UrlDecode($encoded);
    if ($decoded === false) return null;
    $payload = json_decode($decoded, true);
    if (!is_array($payload) || empty($payload['uid']) || empty($payload['exp'])) return null;
    $nowMs = (int)round(microtime(true) * 1000);
    if ($nowMs > (int)$payload['exp']) return null;
    return $payload;
}

function getBearerToken(): string {
    $candidates = [];
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $candidates[] = (string)$_SERVER['HTTP_AUTHORIZATION'];
    }
    if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $candidates[] = (string)$_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    if (!empty($_SERVER['HTTP_X_HR_AUTH'])) {
        $candidates[] = (string)$_SERVER['HTTP_X_HR_AUTH'];
    }
    if (function_exists('getallheaders')) {
        $headers = @getallheaders();
        if (is_array($headers)) {
            foreach ($headers as $k => $v) {
                $lk = strtolower((string)$k);
                if ($lk === 'authorization' || $lk === 'x-hr-auth') {
                    $candidates[] = (string)$v;
                }
            }
        }
    }
    foreach ($candidates as $h) {
        if (stripos($h, 'Bearer ') === 0) {
            return trim(substr($h, 7));
        }
    }
    return '';
}

function getInitialDatabase(): array {
    return [
        'users' => [
            [
                'id' => 'u-admin-1',
                'username' => 'javadabadiyan',
                'password' => hashPasswordPhp('javad_5221157'),
                'fullName' => 'جواد آبادیان (مدیر ارشد سامانه)',
                'role' => 'super_admin',
                'department' => 'مدیریت منابع انسانی و کارگزینی',
                'permissions' => [
                    'canManagePersonnel' => true,
                    'canManageKaraneh' => true,
                    'canManageJobGroups' => true,
                    'canManageCommitments' => true,
                    'canManageUsers' => true,
                    'canExportExcel' => true,
                    'canImportExcel' => true,
                    'canBackupRestore' => true,
                ],
                'isActive' => true,
                'createdAt' => '1403/01/01',
                'lastLogin' => 'هم‌اکنون',
            ],
            [
                'id' => 'u-officer-2',
                'username' => 'karaneh_admin',
                'password' => hashPasswordPhp('12345678'),
                'fullName' => 'سارا کاظمی (کارشناس ارزیابی و کارانه)',
                'role' => 'karaneh_officer',
                'department' => 'اداره جبران خدمت و کارانه',
                'permissions' => [
                    'canManagePersonnel' => false,
                    'canManageKaraneh' => true,
                    'canManageJobGroups' => false,
                    'canManageCommitments' => false,
                    'canManageUsers' => false,
                    'canExportExcel' => true,
                    'canImportExcel' => true,
                    'canBackupRestore' => false,
                ],
                'isActive' => true,
                'createdAt' => '1403/03/10',
                'lastLogin' => '۱۴۰۳/۰۸/۰۲',
            ],
            [
                'id' => 'u-officer-3',
                'username' => 'hr_expert',
                'password' => hashPasswordPhp('12345678'),
                'fullName' => 'محمد امینی (کارشناس امور اداری و پرسنلی)',
                'role' => 'hr_officer',
                'department' => 'امور کارکنان و قراردادها',
                'permissions' => [
                    'canManagePersonnel' => true,
                    'canManageKaraneh' => false,
                    'canManageJobGroups' => true,
                    'canManageCommitments' => true,
                    'canManageUsers' => false,
                    'canExportExcel' => true,
                    'canImportExcel' => true,
                    'canBackupRestore' => false,
                ],
                'isActive' => true,
                'createdAt' => '1403/04/15',
                'lastLogin' => '۱۴۰۳/۰۸/۰۱',
            ],
        ],
        'jobGroups' => [
            [
                'id' => 'jg-1',
                'code' => 'گروه ۱۶',
                'title' => 'مدیران ارشد و رؤسای ادارات',
                'grade' => 16,
                'minBaseSalary' => 280000000,
                'maxBaseSalary' => 450000000,
                'maxKaranehCeiling' => 120000000,
                'requiredExperienceYears' => 12,
                'requiredDegree' => 'کارشناسی ارشد یا دکتری',
                'description' => 'راهبری استراتژیک، مدیریت واحدهای ستادی و مسئولیت نهایی برنامه‌ها',
            ],
            [
                'id' => 'jg-2',
                'code' => 'گروه ۱۴',
                'title' => 'کارشناسان مسئول و سرپرستان',
                'grade' => 14,
                'minBaseSalary' => 220000000,
                'maxBaseSalary' => 320000000,
                'maxKaranehCeiling' => 85000000,
                'requiredExperienceYears' => 8,
                'requiredDegree' => 'کارشناسی یا کارشناسی ارشد',
                'description' => 'نظارت اجرایی، هماهنگی پروژه‌ها و هدایت تیم‌های تخصصی',
            ],
            [
                'id' => 'jg-3',
                'code' => 'گروه ۱۲',
                'title' => 'کارشناسان ارشد تخصصی',
                'grade' => 12,
                'minBaseSalary' => 180000000,
                'maxBaseSalary' => 260000000,
                'maxKaranehCeiling' => 65000000,
                'requiredExperienceYears' => 5,
                'requiredDegree' => 'کارشناسی مرتبط',
                'description' => 'اجرای وظایف تخصصی، تحلیل فرآیندها و توسعه سامانه‌ها',
            ],
            [
                'id' => 'jg-4',
                'code' => 'گروه ۱۰',
                'title' => 'کارشناسان و تکنسین‌های فنی',
                'grade' => 10,
                'minBaseSalary' => 140000000,
                'maxBaseSalary' => 200000000,
                'maxKaranehCeiling' => 50000000,
                'requiredExperienceYears' => 3,
                'requiredDegree' => 'کارشناسی یا کاردانی فنی',
                'description' => 'پشتیبانی فنی، نگهداری تجهیزات و امور اجرایی',
            ],
            [
                'id' => 'jg-5',
                'code' => 'گروه ۸',
                'title' => 'متصدیان اداری و پشتیبانی',
                'grade' => 8,
                'minBaseSalary' => 110000000,
                'maxBaseSalary' => 160000000,
                'maxKaranehCeiling' => 35000000,
                'requiredExperienceYears' => 1,
                'requiredDegree' => 'دیپلم یا کاردانی',
                'description' => 'دبیرخانه، بایگانی، خدمات دفتری و لجستیک',
            ],
        ],
        'jobClassifications' => [],
        'personnel' => [
            [
                'id' => 'p-101',
                'personnelCode' => '10101',
                'firstName' => 'رضا',
                'lastName' => 'قاسمی',
                'fullName' => 'رضا قاسمی',
                'nationalId' => '0078912345',
                'position' => 'مدیر فناوری اطلاعات و سامانه‌ها',
                'department' => 'فناوری اطلاعات',
                'hireDate' => '1397/02/10',
                'employmentType' => 'رسمی',
                'jobGroupId' => 'jg-1',
                'jobGroupName' => 'گروه ۱۶ - مدیران ارشد و رؤسای ادارات',
                'education' => 'کارشناسی ارشد مهندسی نرم‌افزار',
                'phone' => '09121114567',
                'email' => 'r.ghasemi@org.ir',
                'status' => 'فعال',
                'baseSalary' => 340000000,
                'notes' => 'مسئول مستقیم تحول دیجیتال و سرورهای مرکزی',
                'createdAt' => '1403/01/01',
                'updatedAt' => '1403/08/01',
            ],
            [
                'id' => 'p-102',
                'personnelCode' => '10102',
                'firstName' => 'زهرا',
                'lastName' => 'کریمی',
                'fullName' => 'زهرا کریمی',
                'nationalId' => '0065432109',
                'position' => 'رئیس حسابداری و بودجه',
                'department' => 'امور مالی و اقتصادی',
                'hireDate' => '1398/05/15',
                'employmentType' => 'رسمی',
                'jobGroupId' => 'jg-2',
                'jobGroupName' => 'گروه ۱۴ - کارشناسان مسئول و سرپرستان',
                'education' => 'کارشناسی ارشد حسابداری و مدیریت مالی',
                'phone' => '09122225678',
                'email' => 'z.karimi@org.ir',
                'status' => 'فعال',
                'baseSalary' => 290000000,
                'notes' => 'ناظر بر فرآیندهای مالیاتی و محاسبات کارانه',
                'createdAt' => '1403/01/01',
                'updatedAt' => '1403/08/01',
            ],
            [
                'id' => 'p-103',
                'personnelCode' => '10103',
                'firstName' => 'امیرحسین',
                'lastName' => 'مرادی',
                'fullName' => 'امیرحسین مرادی',
                'nationalId' => '0451239876',
                'position' => 'کارشناس ارشد شبکه و امنیت',
                'department' => 'فناوری اطلاعات',
                'hireDate' => '1400/07/01',
                'employmentType' => 'پیمانی',
                'jobGroupId' => 'jg-3',
                'jobGroupName' => 'گروه ۱۲ - کارشناسان ارشد تخصصی',
                'education' => 'کارشناسی مهندسی فناوری اطلاعات',
                'phone' => '09123336789',
                'email' => 'a.moradi@org.ir',
                'status' => 'فعال',
                'baseSalary' => 235000000,
                'notes' => 'طراح معماری دیتابیس لوکال و تونل ارتباطی امن',
                'createdAt' => '1403/01/01',
                'updatedAt' => '1403/08/01',
            ],
            [
                'id' => 'p-104',
                'personnelCode' => '10104',
                'firstName' => 'فاطمه',
                'lastName' => 'صادقی',
                'fullName' => 'فاطمه صادقی',
                'nationalId' => '0032165498',
                'position' => 'کارشناس کارگزینی و تشکیلات',
                'department' => 'منابع انسانی',
                'hireDate' => '1401/03/20',
                'employmentType' => 'قراردادی',
                'jobGroupId' => 'jg-3',
                'jobGroupName' => 'گروه ۱۲ - کارشناسان ارشد تخصصی',
                'education' => 'کارشناسی مدیریت دولتی',
                'phone' => '09124447890',
                'email' => 'f.sadeghi@org.ir',
                'status' => 'فعال',
                'baseSalary' => 195000000,
                'notes' => 'مسئول ثبت و پایش تعهدات پرسنلی و پرونده‌ها',
                'createdAt' => '1403/01/01',
                'updatedAt' => '1403/08/01',
            ],
            [
                'id' => 'p-105',
                'personnelCode' => '10105',
                'firstName' => 'مهدی',
                'lastName' => 'نجفی',
                'fullName' => 'مهدی نجفی',
                'nationalId' => '0389874561',
                'position' => 'سرپرست خط تولید و تضمین کیفیت',
                'department' => 'تولید و عملیات',
                'hireDate' => '1399/11/12',
                'employmentType' => 'رسمی',
                'jobGroupId' => 'jg-2',
                'jobGroupName' => 'گروه ۱۴ - کارشناسان مسئول و سرپرستان',
                'education' => 'کارشناسی مهندسی صنایع',
                'phone' => '09125558901',
                'email' => 'm.najafi@org.ir',
                'status' => 'فعال',
                'baseSalary' => 275000000,
                'notes' => 'مدیریت شیفت‌های کارگاهی و راندمان خطوط',
                'createdAt' => '1403/01/01',
                'updatedAt' => '1403/08/01',
            ],
            [
                'id' => 'p-106',
                'personnelCode' => '10106',
                'firstName' => 'سمیرا',
                'lastName' => 'پژمان',
                'fullName' => 'سمیرا پژمان',
                'nationalId' => '0081234567',
                'position' => 'مسئول دفتر مدیرعامل و دبیرخانه',
                'department' => 'مدیریت و پشتیبانی',
                'hireDate' => '1402/01/15',
                'employmentType' => 'قراردادی',
                'jobGroupId' => 'jg-5',
                'jobGroupName' => 'گروه ۸ - متصدیان اداری و پشتیبانی',
                'education' => 'کاردانی روابط عمومی',
                'phone' => '09126669012',
                'email' => 's.pezhman@org.ir',
                'status' => 'فعال',
                'baseSalary' => 145000000,
                'notes' => 'پیگیری مکاتبات اداری و ارجاعات کارگزینی',
                'createdAt' => '1403/01/01',
                'updatedAt' => '1403/08/01',
            ],
        ],
        'karaneh' => [
            [
                'id' => 'k-101-07', 'personnelId' => 'p-101', 'personnelCode' => '10101', 'fullName' => 'رضا قاسمی',
                'department' => 'فناوری اطلاعات', 'position' => 'مدیر فناوری اطلاعات و سامانه‌ها', 'period' => '1403-07',
                'baseKaraneh' => 60000000, 'overtimeBonus' => 20000000, 'deductions' => 0, 'finalKaraneh' => 80000000,
                'notes' => 'تحویل فاز یک شبکه', 'updatedAt' => '1403/07/28',
            ],
            [
                'id' => 'k-102-07', 'personnelId' => 'p-102', 'personnelCode' => '10102', 'fullName' => 'زهرا کریمی',
                'department' => 'امور مالی و اقتصادی', 'position' => 'رئیس حسابداری و بودجه', 'period' => '1403-07',
                'baseKaraneh' => 48000000, 'overtimeBonus' => 12000000, 'deductions' => 0, 'finalKaraneh' => 60000000,
                'notes' => 'بستن حساب‌های شش‌ماهه', 'updatedAt' => '1403/07/28',
            ],
            [
                'id' => 'k-103-07', 'personnelId' => 'p-103', 'personnelCode' => '10103', 'fullName' => 'امیرحسین مرادی',
                'department' => 'فناوری اطلاعات', 'position' => 'کارشناس ارشد شبکه و امنیت', 'period' => '1403-07',
                'baseKaraneh' => 38000000, 'overtimeBonus' => 7000000, 'deductions' => 0, 'finalKaraneh' => 45000000,
                'notes' => 'پیکربندی فایروال', 'updatedAt' => '1403/07/28',
            ],
            [
                'id' => 'k-104-07', 'personnelId' => 'p-104', 'personnelCode' => '10104', 'fullName' => 'فاطمه صادقی',
                'department' => 'منابع انسانی', 'position' => 'کارشناس کارگزینی و تشکیلات', 'period' => '1403-07',
                'baseKaraneh' => 32000000, 'overtimeBonus' => 6000000, 'deductions' => 0, 'finalKaraneh' => 38000000,
                'notes' => 'ساماندهی پرونده‌های فیزیکی', 'updatedAt' => '1403/07/28',
            ],
            [
                'id' => 'k-105-07', 'personnelId' => 'p-105', 'personnelCode' => '10105', 'fullName' => 'مهدی نجفی',
                'department' => 'تولید و عملیات', 'position' => 'سرپرست خط تولید و تضمین کیفیت', 'period' => '1403-07',
                'baseKaraneh' => 46000000, 'overtimeBonus' => 14000000, 'deductions' => 0, 'finalKaraneh' => 60000000,
                'notes' => 'کاهش ضایعات خط A', 'updatedAt' => '1403/07/28',
            ],
            [
                'id' => 'k-106-07', 'personnelId' => 'p-106', 'personnelCode' => '10106', 'fullName' => 'سمیرا پژمان',
                'department' => 'مدیریت و پشتیبانی', 'position' => 'مسئول دفتر مدیرعامل و دبیرخانه', 'period' => '1403-07',
                'baseKaraneh' => 22000000, 'overtimeBonus' => 4000000, 'deductions' => 0, 'finalKaraneh' => 26000000,
                'notes' => 'نظم در مکاتبات جلسات هیئت‌مدیره', 'updatedAt' => '1403/07/28',
            ],
            [
                'id' => 'k-101-08', 'personnelId' => 'p-101', 'personnelCode' => '10101', 'fullName' => 'رضا قاسمی',
                'department' => 'فناوری اطلاعات', 'position' => 'مدیر فناوری اطلاعات و سامانه‌ها', 'period' => '1403-08',
                'baseKaraneh' => 65000000, 'overtimeBonus' => 28000000, 'deductions' => 0, 'finalKaraneh' => 93000000,
                'notes' => 'راه‌اندازی کامل دیتابیس لوکال و پشتیبانی ۲۴ ساعته (+۱۶.۲۵٪ رشد)', 'updatedAt' => '1403/08/29',
            ],
            [
                'id' => 'k-102-08', 'personnelId' => 'p-102', 'personnelCode' => '10102', 'fullName' => 'زهرا کریمی',
                'department' => 'امور مالی و اقتصادی', 'position' => 'رئیس حسابداری و بودجه', 'period' => '1403-08',
                'baseKaraneh' => 52000000, 'overtimeBonus' => 16000000, 'deductions' => 0, 'finalKaraneh' => 68000000,
                'notes' => 'ارائه گزارش تحلیلی سود و زیان واحدها (+۱۳.۳٪ رشد)', 'updatedAt' => '1403/08/29',
            ],
            [
                'id' => 'k-103-08', 'personnelId' => 'p-103', 'personnelCode' => '10103', 'fullName' => 'امیرحسین مرادی',
                'department' => 'فناوری اطلاعات', 'position' => 'کارشناس ارشد شبکه و امنیت', 'period' => '1403-08',
                'baseKaraneh' => 42000000, 'overtimeBonus' => 11000000, 'deductions' => 0, 'finalKaraneh' => 53000000,
                'notes' => 'پیاده‌سازی رمزنگاری اطلاعات و تونل اینترنتی (+۱۷.۸٪ رشد)', 'updatedAt' => '1403/08/29',
            ],
            [
                'id' => 'k-104-08', 'personnelId' => 'p-104', 'personnelCode' => '10104', 'fullName' => 'فاطمه صادقی',
                'department' => 'منابع انسانی', 'position' => 'کارشناس کارگزینی و تشکیلات', 'period' => '1403-08',
                'baseKaraneh' => 34000000, 'overtimeBonus' => 8000000, 'deductions' => 0, 'finalKaraneh' => 42000000,
                'notes' => 'ورود اطلاعات اکسل پرونده‌های پرسنلی (+۱۰.۵٪ رشد)', 'updatedAt' => '1403/08/29',
            ],
            [
                'id' => 'k-105-08', 'personnelId' => 'p-105', 'personnelCode' => '10105', 'fullName' => 'مهدی نجفی',
                'department' => 'تولید و عملیات', 'position' => 'سرپرست خط تولید و تضمین کیفیت', 'period' => '1403-08',
                'baseKaraneh' => 42000000, 'overtimeBonus' => 10000000, 'deductions' => 4000000, 'finalKaraneh' => 48000000,
                'notes' => 'کسر به دلیل تاخیر در تحویل محموله خط تولید (-۲۰٪ کاهش)', 'updatedAt' => '1403/08/29',
            ],
            [
                'id' => 'k-106-08', 'personnelId' => 'p-106', 'personnelCode' => '10106', 'fullName' => 'سمیرا پژمان',
                'department' => 'مدیریت و پشتیبانی', 'position' => 'مسئول دفتر مدیرعامل و دبیرخانه', 'period' => '1403-08',
                'baseKaraneh' => 24000000, 'overtimeBonus' => 5000000, 'deductions' => 0, 'finalKaraneh' => 29000000,
                'notes' => 'هماهنگی منظم همایش سالانه (+۱۱.۵٪ رشد)', 'updatedAt' => '1403/08/29',
            ],
        ],
        'commitments' => [
            [
                'id' => 'cmt-1', 'personnelId' => 'p-101', 'personnelCode' => '10101', 'personnelName' => 'رضا قاسمی',
                'commitmentType' => 'تعهد خدمت', 'amount' => 1500000000, 'previouslyTakenAmount' => 300000000,
                'maxAllowedAmount' => 2500000000, 'startDate' => '1397/02/10', 'endDate' => '1407/02/10',
                'status' => 'جاری و معتبر', 'isArchived' => false, 'guarantorName' => 'مهندس احمد باقری',
                'notes' => 'تعهد خدمت ۱۰ ساله بابت بورسیه دوره‌های امنیت پیشرفته',
            ],
            [
                'id' => 'cmt-2', 'personnelId' => 'p-102', 'personnelCode' => '10102', 'personnelName' => 'زهرا کریمی',
                'commitmentType' => 'تعهد حسابداری', 'amount' => 500000000, 'previouslyTakenAmount' => 250000000,
                'maxAllowedAmount' => 1500000000, 'startDate' => '1403/05/15', 'endDate' => '1405/05/15',
                'status' => 'جاری و معتبر', 'isArchived' => false, 'guarantorName' => 'دکتر علیرضا کریمی',
                'notes' => 'تعهد حسابداری مسئول امور مالی و تنخواه گردان',
            ],
            [
                'id' => 'cmt-3', 'personnelId' => 'p-103', 'personnelCode' => '10103', 'personnelName' => 'امیرحسین مرادی',
                'commitmentType' => 'سفته حسن انجام کار', 'amount' => 800000000, 'previouslyTakenAmount' => 0,
                'maxAllowedAmount' => 1200000000, 'startDate' => '1400/07/01', 'endDate' => '1404/07/01',
                'status' => 'جاری و معتبر', 'isArchived' => false, 'guarantorName' => 'پدر - حسن مرادی',
                'notes' => 'تضمین اموال رایانه‌ای و دیتاسنتر',
            ],
            [
                'id' => 'cmt-4', 'personnelId' => 'p-104', 'personnelCode' => '10104', 'personnelName' => 'فاطمه صادقی',
                'commitmentType' => 'تعهد دوره‌های آموزشی', 'amount' => 300000000, 'previouslyTakenAmount' => 100000000,
                'maxAllowedAmount' => 600000000, 'startDate' => '1402/06/01', 'endDate' => '1404/06/01',
                'status' => 'جاری و معتبر', 'isArchived' => false, 'guarantorName' => '-',
                'notes' => 'تعهد خدمت دو ساله پس از گذراندن دوره طبقه‌بندی مشاغل',
            ],
        ],
        'payroll' => [],
        'miningVolumes' => [
            ['id' => 'mv-140307-1', 'period' => '1403-07', 'unitName' => 'استخراج و معدن‌کاری', 'activityType' => 'استخراج ماده معدنی', 'metricTitle' => 'استخراج سینه کار اصلی', 'volumeValue' => 44200, 'targetVolume' => 48000, 'unitLabel' => 'تن', 'status' => 'تکمیل‌شده', 'notes' => 'عملکرد مهرماه', 'updatedAt' => '1403/07/30'],
            ['id' => 'mv-140307-2', 'period' => '1403-07', 'unitName' => 'تراش و باطله‌برداری', 'activityType' => 'باطله‌برداری', 'metricTitle' => 'باطله‌برداری جبهه شمالی', 'volumeValue' => 56000, 'targetVolume' => 58000, 'unitLabel' => 'مترمکعب', 'status' => 'تکمیل‌شده', 'notes' => 'آمار بارگیری و حمل باطله', 'updatedAt' => '1403/07/30'],
            ['id' => 'mv-140307-3', 'period' => '1403-07', 'unitName' => 'فرآوری و سنگ‌شکن', 'activityType' => 'خردایش و دانه‌بندی', 'metricTitle' => 'خوراک ورودی سنگ‌شکن', 'volumeValue' => 39500, 'targetVolume' => 42000, 'unitLabel' => 'تن', 'status' => 'تکمیل‌شده', 'notes' => 'بهره‌برداری خط یک و دو', 'updatedAt' => '1403/07/30'],
            ['id' => 'mv-140308-1', 'period' => '1403-08', 'unitName' => 'استخراج و معدن‌کاری', 'activityType' => 'استخراج ماده معدنی', 'metricTitle' => 'استخراج سینه کار اصلی', 'volumeValue' => 49800, 'targetVolume' => 50000, 'unitLabel' => 'تن', 'status' => 'نزدیک به هدف', 'notes' => 'رشد ۱۲.۷ درصدی نسبت به مهرماه', 'updatedAt' => '1403/08/29'],
            ['id' => 'mv-140308-2', 'period' => '1403-08', 'unitName' => 'تراش و باطله‌برداری', 'activityType' => 'باطله‌برداری', 'metricTitle' => 'باطله‌برداری جبهه شمالی', 'volumeValue' => 63400, 'targetVolume' => 60000, 'unitLabel' => 'مترمکعب', 'status' => 'فراتر از برنامه', 'notes' => 'اضافه‌شدن یک دستگاه دامپتراک', 'updatedAt' => '1403/08/29'],
            ['id' => 'mv-140308-3', 'period' => '1403-08', 'unitName' => 'فرآوری و سنگ‌شکن', 'activityType' => 'خردایش و دانه‌بندی', 'metricTitle' => 'خوراک ورودی سنگ‌شکن', 'volumeValue' => 45100, 'targetVolume' => 44000, 'unitLabel' => 'تن', 'status' => 'فراتر از برنامه', 'notes' => 'کاهش توقفات خط سنگ‌شکن', 'updatedAt' => '1403/08/29'],
        ],
        'miningMachinery' => [
            ['id' => 'mm-1', 'machineCode' => 'EQ-DT-101', 'machineName' => 'دامپتراک بلاز ۴۵ تن شماره ۱', 'machineType' => 'دامپتراک', 'unitName' => 'حمل و نقل و بارگیری', 'status' => 'آماده به کار', 'issueDescription' => 'سالم و فعال در شیفت روز و شب', 'stoppedSince' => '-', 'estimatedReadyDate' => '-', 'operatorName' => 'حسین محمدی', 'notes' => 'آماده سرویس کامل', 'updatedAt' => '1403/08/29'],
            ['id' => 'mm-2', 'machineCode' => 'EQ-DT-102', 'machineName' => 'دامپتراک کوماتسو HD465 شماره ۲', 'machineType' => 'دامپتراک', 'unitName' => 'حمل و نقل و بارگیری', 'status' => 'آماده به کار', 'issueDescription' => 'فعال در مسیر جبهه استخراج به سنگ‌شکن', 'stoppedSince' => '-', 'estimatedReadyDate' => '-', 'operatorName' => 'مجید کریمی', 'notes' => '', 'updatedAt' => '1403/08/29'],
            ['id' => 'mm-3', 'machineCode' => 'EQ-EX-201', 'machineName' => 'بیل مکانیکی کوماتسو PC400', 'machineType' => 'بیل مکانیکی', 'unitName' => 'استخراج و معدن‌کاری', 'status' => 'خراب / در تعمیرگاه', 'issueDescription' => 'نشتی جک بوم و تعویض پکینگ هیدرولیک در تعمیرگاه مرکزی', 'stoppedSince' => '1403/08/22', 'estimatedReadyDate' => '1403/08/28', 'operatorName' => 'تیم تعمیرات سنگین', 'notes' => 'کیت پکینگ تامین شد', 'updatedAt' => '1403/08/29'],
            ['id' => 'mm-4', 'machineCode' => 'EQ-LD-301', 'machineName' => 'لودر کاترپیلار 966H شماره ۱', 'machineType' => 'لودر', 'unitName' => 'فرآوری و سنگ‌شکن', 'status' => 'در انتظار قطعه', 'issueDescription' => 'نیاز به تعویض پمپ گیربکس و فیلترهای فشار قوی', 'stoppedSince' => '1403/08/19', 'estimatedReadyDate' => '1403/09/02', 'operatorName' => 'واحد تعمیرگاه', 'notes' => 'درخواست خرید فوری ارسال شده', 'updatedAt' => '1403/08/29'],
            ['id' => 'mm-5', 'machineCode' => 'EQ-BD-401', 'machineName' => 'بولدوزر کوماتسو D155A', 'machineType' => 'بولدوزر', 'unitName' => 'تراش و باطله‌برداری', 'status' => 'سرویس دوره‌ای', 'issueDescription' => 'تعویض روغن ۵۰۰ ساعته و آچارکشی زیربندی', 'stoppedSince' => '1403/08/26', 'estimatedReadyDate' => '1403/08/27', 'operatorName' => 'سرویسکار سیار', 'notes' => 'تحویل در شیفت صبح', 'updatedAt' => '1403/08/29'],
        ],
        'unitReports' => [
            ['id' => 'ur-140308-1', 'period' => '1403-08', 'unitName' => 'واحد فرآوری و سنگ‌شکن', 'reportCategory' => 'تولید و فرآوری', 'metricName' => 'خوراک ورودی به سنگ‌شکن اولیه', 'actualValue' => 45100, 'previousValue' => 39500, 'targetValue' => 44000, 'unitLabel' => 'تن', 'status' => 'تایید شده', 'submittedBy' => 'سرپرست سنگ‌شکن', 'notes' => 'افزایش راندمان خط خردایش شماره ۱ و ۲', 'rawFields' => ['شیفت فعال' => '۳ شیفت', 'ساعات کارکرد مفید' => 612, 'ضریب دسترسی' => '۹۴٪'], 'updatedAt' => '1403/08/29'],
            ['id' => 'ur-140308-2', 'period' => '1403-08', 'unitName' => 'واحد حفاری و آتشباری', 'reportCategory' => 'عملیات استخراج', 'metricName' => 'متراژ حفاری چال‌های انفجاری', 'actualValue' => 12850, 'previousValue' => 11400, 'targetValue' => 12500, 'unitLabel' => 'متر', 'status' => 'تایید شده', 'submittedBy' => 'واحد آتشباری معدن', 'notes' => 'تکمیل الگوی حفاری پله ۴ و ۵ شمالی', 'rawFields' => ['تعداد چال' => 1420, 'مصرف ماده منفجره (کیلوگرم)' => 18400], 'updatedAt' => '1403/08/29'],
            ['id' => 'ur-140308-3', 'period' => '1403-08', 'unitName' => 'واحد ایمنی، بهداشت و محیط زیست (HSE)', 'reportCategory' => 'ایمنی و بازرسی', 'metricName' => 'نرخ انطباق ایمنی شیفت‌های معدن', 'actualValue' => 98.5, 'previousValue' => 96.2, 'targetValue' => 98, 'unitLabel' => 'درصد', 'status' => 'تایید شده', 'submittedBy' => 'مسئول HSE', 'notes' => 'صفر بودن حوادث منجر به فوت یا توقف کار', 'rawFields' => ['تعداد بازرسی' => 64, 'مانور ایمنی برگزارشده' => 3], 'updatedAt' => '1403/08/29'],
            ['id' => 'ur-140308-4', 'period' => '1403-08', 'unitName' => 'واحد انبار، تدارکات و بازرگانی', 'reportCategory' => 'پشتیبانی و تامین', 'metricName' => 'نرخ تامین به‌موقع قطعات مصرفی', 'actualValue' => 92, 'previousValue' => 87, 'targetValue' => 95, 'unitLabel' => 'درصد', 'status' => 'در انتظار بررسی', 'submittedBy' => 'واحد انبار مرکزی', 'notes' => 'سفارش‌گذاری فوری پمپ گیربکس لودر 966H', 'rawFields' => ['تعداد حواله صادره' => 318, 'اقلام بحرانی در مسیر' => 4], 'updatedAt' => '1403/08/29'],
        ],
    ];
}

function normalizeDbArrays(array $db): array {
    foreach (['users', 'jobGroups', 'jobClassifications', 'personnel', 'karaneh', 'commitments', 'payroll', 'miningVolumes', 'miningMachinery', 'unitReports'] as $k) {
        if (!isset($db[$k]) || !is_array($db[$k])) {
            $db[$k] = [];
        }
    }
    return $db;
}

function loadDatabase(): array {
    if (!file_exists(DB_FILE)) {
        $initial = getInitialDatabase();
        saveDatabase($initial);
        return $initial;
    }
    $raw = @file_get_contents(DB_FILE);
    $parsed = $raw ? json_decode($raw, true) : null;
    if (!is_array($parsed)) {
        return getInitialDatabase();
    }
    return normalizeDbArrays($parsed);
}

function saveDatabase(array $data): bool {
    ensureStorageReady();
    $tmp = DB_FILE . '.tmp.' . uniqid('', true);
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false) return false;
    if (@file_put_contents($tmp, $json, LOCK_EX) === false) {
        return false;
    }
    return @rename($tmp, DB_FILE);
}

function createSafetySnapshot(string $reason): void {
    if (!file_exists(DB_FILE)) return;
    $ts = date('Y-m-d_H-i-s');
    $dest = BACKUP_DIR . DIRECTORY_SEPARATOR . 'snapshot_' . $reason . '_' . $ts . '.json';
    @copy(DB_FILE, $dest);
    $files = @glob(BACKUP_DIR . DIRECTORY_SEPARATOR . 'snapshot_*.json') ?: [];
    rsort($files);
    foreach (array_slice($files, 10) as $old) {
        @unlink($old);
    }
}

function withDbLock(callable $fn) {
    ensureStorageReady();
    $fp = @fopen(LOCK_FILE, 'c+');
    if ($fp) {
        @flock($fp, LOCK_EX);
    }
    try {
        $result = $fn();
    } finally {
        if ($fp) {
            @flock($fp, LOCK_UN);
            @fclose($fp);
        }
    }
    return $result;
}

function isSuperAdminUser(array $user): bool {
    return (($user['role'] ?? '') === 'super_admin') || (($user['username'] ?? '') === 'javadabadiyan');
}

function checkPermission(?array $user, string $section, string $action): bool {
    if (!$user || empty($user['isActive'])) return false;
    if (isSuperAdminUser($user)) return true;
    $perms = $user['permissions'] ?? [];
    if (isset($perms[$section]) && is_array($perms[$section]) && array_key_exists($action, $perms[$section]) && is_bool($perms[$section][$action])) {
        return $perms[$section][$action];
    }
    if ($action === 'deleteAll') {
        return false;
    }
    if ($section === 'personnel') {
        if ($action === 'view') return true;
        if ($action === 'exportExcel') return $perms['canExportExcel'] ?? true;
        if ($action === 'importExcel') return !empty($perms['canImportExcel']) && !empty($perms['canManagePersonnel']);
        return !empty($perms['canManagePersonnel']);
    }
    if ($section === 'karaneh') {
        if ($action === 'view') return true;
        if ($action === 'exportExcel') return $perms['canExportExcel'] ?? true;
        if ($action === 'importExcel') return !empty($perms['canImportExcel']) && !empty($perms['canManageKaraneh']);
        return !empty($perms['canManageKaraneh']);
    }
    if ($section === 'jobGroups') {
        if ($action === 'view') return true;
        if ($action === 'exportExcel') return $perms['canExportExcel'] ?? true;
        if ($action === 'importExcel') return !empty($perms['canImportExcel']) && !empty($perms['canManageJobGroups']);
        return !empty($perms['canManageJobGroups']);
    }
    if ($section === 'commitments') {
        if ($action === 'view' || $action === 'print') return true;
        if ($action === 'exportExcel') return $perms['canExportExcel'] ?? true;
        if ($action === 'importExcel') return !empty($perms['canImportExcel']) && !empty($perms['canManageCommitments']);
        return !empty($perms['canManageCommitments']);
    }
    if ($section === 'payroll') {
        if ($action === 'view') return true;
        if ($action === 'exportExcel') return $perms['canExportExcel'] ?? true;
        if ($action === 'importExcel') return !empty($perms['canImportExcel']) && (!empty($perms['canManagePersonnel']) || !empty($perms['canManageKaraneh']));
        return !empty($perms['canManagePersonnel']) || !empty($perms['canManageKaraneh']);
    }
    if ($section === 'users') {
        return !empty($perms['canManageUsers']);
    }
    if ($section === 'system') {
        if ($action === 'dashboardStats') return true;
        return !empty($perms['canBackupRestore']);
    }
    return false;
}

function getAllowedUnitsPhp(?array $user): array {
    $raw = $user['permissions']['unitOperations']['allowedUnits'] ?? [];
    if (!is_array($raw)) return [];
    return array_values(array_filter(array_map(fn($x) => trim((string)$x), $raw), fn($x) => $x !== ''));
}

function isUnitAllowedPhp(?array $user, ?string $unitName): bool {
    if (!$user || empty($user['isActive'])) return false;
    if (isSuperAdminUser($user) || checkPermission($user, 'ceoDashboard', 'view')) return true;
    if (!checkPermission($user, 'unitOperations', 'view')) return false;
    $allowed = getAllowedUnitsPhp($user);
    if (count($allowed) === 0) return true;
    $u = trim((string)($unitName ?? ''));
    if ($u === '') return false;
    $nu = normPayrollKey($u);
    foreach ($allowed as $a) {
        $na = normPayrollKey($a);
        if ($na === $nu || mb_strpos($nu, $na) !== false || mb_strpos($na, $nu) !== false) {
            return true;
        }
    }
    return false;
}

function isWorkshopOrUnitAllowedPhp(?array $user, ?string $unitName): bool {
    return isUnitAllowedPhp($user, $unitName) || isUnitAllowedPhp($user, 'واحد تعمیرگاه و ماشین‌آلات سنگین') || isUnitAllowedPhp($user, 'تعمیرگاه');
}

function isDispatchingOrUnitAllowedPhp(?array $user, ?string $unitName): bool {
    return isUnitAllowedPhp($user, $unitName) || isUnitAllowedPhp($user, 'واحد دیسپچینگ و کنترل تولید') || isUnitAllowedPhp($user, 'دیسپچینگ');
}

function hasMiningOrUnitPermPhp(?array $user, string $action): bool {
    return checkPermission($user, 'ceoDashboard', $action) || checkPermission($user, 'unitOperations', $action);
}

function stripPassword(array $user): array {
    unset($user['password']);
    return $user;
}

function requireAuthUser(array $db, string $secret): array {
    $token = getBearerToken();
    if ($token === '') {
        jsonResponse(['success' => false, 'message' => 'احراز هویت انجام نشده است. لطفاً مجدداً وارد شوید.'], 401);
    }
    $verified = verifyAuthToken($token, $secret);
    if ($verified) {
        foreach ($db['users'] as $u) {
            if (($u['id'] ?? '') === $verified['uid']) {
                if (empty($u['isActive'])) {
                    jsonResponse(['success' => false, 'message' => 'حساب کاربری یافت نشد یا غیرفعال شده است.'], 403);
                }
                return $u;
            }
        }
        jsonResponse(['success' => false, 'message' => 'حساب کاربری یافت نشد یا غیرفعال شده است.'], 403);
    }
    // Check Firebase ID Token payload as fallback if Google Sign-in bearer token sent directly
    $jwtParts = explode('.', $token);
    if (count($jwtParts) === 3) {
        $payloadRaw = base64UrlDecode($jwtParts[1]);
        $decoded = $payloadRaw ? json_decode($payloadRaw, true) : null;
        if (is_array($decoded) && !empty($decoded['email']) && !empty($decoded['email_verified']) && (int)($decoded['exp'] ?? 0) > time()) {
            $fbEmail = strtolower(trim((string)$decoded['email']));
            foreach ($db['users'] as $u) {
                if (
                    (!empty($u['uid']) && $u['uid'] === ($decoded['user_id'] ?? $decoded['sub'] ?? '')) ||
                    (!empty($u['email']) && strtolower(trim((string)$u['email'])) === $fbEmail) ||
                    ($fbEmail === 'javadabadiyangoshi@gmail.com' && (($u['username'] ?? '') === 'javadabadiyan' || ($u['role'] ?? '') === 'super_admin'))
                ) {
                    if (empty($u['isActive'])) {
                        jsonResponse(['success' => false, 'message' => 'حساب کاربری غیرفعال است.'], 403);
                    }
                    return $u;
                }
            }
        }
    }
    jsonResponse(['success' => false, 'message' => 'نشست کاربری منقضی یا نامعتبر است. لطفاً مجدداً وارد شوید.'], 401);
}

function requirePerm(array $user, string $section, string $action): void {
    if (!checkPermission($user, $section, $action)) {
        jsonResponse(['success' => false, 'message' => 'شما مجوز لازم برای انجام این عملیات را ندارید.'], 403);
    }
}

function getJsonBody(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function buildPresetPermissions(string $presetName): array {
    $p = trim($presetName);
    if (containsStr($p, 'مدیر عامل') || containsStr($p, 'مدیرعامل')) {
        return [
            'personnel' => ['view' => true, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => true, 'viewSalary' => true, 'documents' => true],
            'karaneh' => ['view' => true, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => true],
            'jobGroups' => ['view' => true, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => true],
            'commitments' => ['view' => true, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'print' => true, 'archive' => false, 'importExcel' => false, 'exportExcel' => true],
            'payroll' => ['view' => true, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => true],
            'users' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false],
            'system' => ['dashboardStats' => true, 'backupDatabase' => false, 'restoreDatabase' => false],
            'smartDashboard' => ['view' => true, 'exportExcel' => true, 'print' => true],
            'ceoDashboard' => ['view' => true, 'create' => true, 'edit' => true, 'delete' => true, 'deleteAll' => false, 'importExcel' => true, 'exportExcel' => true, 'print' => true],
            'unitOperations' => ['view' => true, 'create' => true, 'edit' => true, 'delete' => true, 'deleteAll' => false, 'importExcel' => true, 'exportExcel' => true, 'allowedUnits' => []],
            'canManagePersonnel' => false, 'canManageKaraneh' => false, 'canManageJobGroups' => false, 'canManageCommitments' => false,
            'canManageUsers' => false, 'canExportExcel' => true, 'canImportExcel' => false, 'canBackupRestore' => false,
        ];
    }
    if (containsStr($p, 'دیسپچینگ')) {
        return [
            'personnel' => ['view' => true, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false, 'viewSalary' => false, 'documents' => false],
            'karaneh' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false],
            'jobGroups' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false],
            'commitments' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'print' => false, 'archive' => false, 'importExcel' => false, 'exportExcel' => false],
            'payroll' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false],
            'users' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false],
            'system' => ['dashboardStats' => true, 'backupDatabase' => false, 'restoreDatabase' => false],
            'smartDashboard' => ['view' => false, 'exportExcel' => false, 'print' => false],
            'ceoDashboard' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false, 'print' => false],
            'unitOperations' => ['view' => true, 'create' => true, 'edit' => true, 'delete' => true, 'deleteAll' => false, 'importExcel' => true, 'exportExcel' => true, 'allowedUnits' => ['واحد دیسپچینگ و کنترل تولید', 'استخراج و معدن‌کاری', 'تراش و باطله‌برداری', 'حمل و نقل و بارگیری']],
            'canManagePersonnel' => false, 'canManageKaraneh' => false, 'canManageJobGroups' => false, 'canManageCommitments' => false,
            'canManageUsers' => false, 'canExportExcel' => true, 'canImportExcel' => true, 'canBackupRestore' => false,
        ];
    }
    if (containsStr($p, 'تعمیرگاه')) {
        return [
            'personnel' => ['view' => true, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false, 'viewSalary' => false, 'documents' => false],
            'karaneh' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false],
            'jobGroups' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false],
            'commitments' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'print' => false, 'archive' => false, 'importExcel' => false, 'exportExcel' => false],
            'payroll' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false],
            'users' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false],
            'system' => ['dashboardStats' => true, 'backupDatabase' => false, 'restoreDatabase' => false],
            'smartDashboard' => ['view' => false, 'exportExcel' => false, 'print' => false],
            'ceoDashboard' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false, 'print' => false],
            'unitOperations' => ['view' => true, 'create' => true, 'edit' => true, 'delete' => true, 'deleteAll' => false, 'importExcel' => true, 'exportExcel' => true, 'allowedUnits' => ['واحد تعمیرگاه و ماشین‌آلات سنگین']],
            'canManagePersonnel' => false, 'canManageKaraneh' => false, 'canManageJobGroups' => false, 'canManageCommitments' => false,
            'canManageUsers' => false, 'canExportExcel' => true, 'canImportExcel' => true, 'canBackupRestore' => false,
        ];
    }
    if (containsStr($p, 'سرپرست واحد')) {
        return [
            'personnel' => ['view' => true, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => true, 'viewSalary' => false, 'documents' => false],
            'karaneh' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false],
            'jobGroups' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false],
            'commitments' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'print' => false, 'archive' => false, 'importExcel' => false, 'exportExcel' => false],
            'payroll' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false],
            'users' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false],
            'system' => ['dashboardStats' => true, 'backupDatabase' => false, 'restoreDatabase' => false],
            'smartDashboard' => ['view' => false, 'exportExcel' => false, 'print' => false],
            'ceoDashboard' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false, 'print' => false],
            'unitOperations' => ['view' => true, 'create' => true, 'edit' => true, 'delete' => true, 'deleteAll' => false, 'importExcel' => true, 'exportExcel' => true, 'allowedUnits' => []],
            'canManagePersonnel' => false, 'canManageKaraneh' => false, 'canManageJobGroups' => false, 'canManageCommitments' => false,
            'canManageUsers' => false, 'canExportExcel' => true, 'canImportExcel' => true, 'canBackupRestore' => false,
        ];
    }
    if (containsStr($p, 'مدیر')) {
        return [
            'personnel' => ['view' => true, 'create' => true, 'edit' => true, 'delete' => true, 'deleteAll' => true, 'importExcel' => true, 'exportExcel' => true, 'viewSalary' => true, 'documents' => true],
            'karaneh' => ['view' => true, 'create' => true, 'edit' => true, 'delete' => true, 'deleteAll' => true, 'importExcel' => true, 'exportExcel' => true],
            'jobGroups' => ['view' => true, 'create' => true, 'edit' => true, 'delete' => true, 'deleteAll' => true, 'importExcel' => true, 'exportExcel' => true],
            'commitments' => ['view' => true, 'create' => true, 'edit' => true, 'delete' => true, 'deleteAll' => true, 'print' => true, 'archive' => true, 'importExcel' => true, 'exportExcel' => true],
            'payroll' => ['view' => true, 'create' => true, 'edit' => true, 'delete' => true, 'deleteAll' => true, 'importExcel' => true, 'exportExcel' => true],
            'users' => ['view' => true, 'create' => true, 'edit' => true, 'delete' => true, 'deleteAll' => true, 'importExcel' => true, 'exportExcel' => true],
            'system' => ['dashboardStats' => true, 'backupDatabase' => true, 'restoreDatabase' => true],
            'smartDashboard' => ['view' => true, 'exportExcel' => true, 'print' => true],
            'ceoDashboard' => ['view' => true, 'create' => true, 'edit' => true, 'delete' => true, 'deleteAll' => true, 'importExcel' => true, 'exportExcel' => true, 'print' => true],
            'unitOperations' => ['view' => true, 'create' => true, 'edit' => true, 'delete' => true, 'deleteAll' => true, 'importExcel' => true, 'exportExcel' => true, 'allowedUnits' => []],
            'canManagePersonnel' => true, 'canManageKaraneh' => true, 'canManageJobGroups' => true, 'canManageCommitments' => true,
            'canManageUsers' => true, 'canExportExcel' => true, 'canImportExcel' => true, 'canBackupRestore' => true,
        ];
    }
    if (containsStr($p, 'کارگزینی')) {
        return [
            'personnel' => ['view' => true, 'create' => true, 'edit' => true, 'delete' => false, 'deleteAll' => false, 'importExcel' => true, 'exportExcel' => true, 'viewSalary' => true, 'documents' => true],
            'karaneh' => ['view' => true, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => true],
            'jobGroups' => ['view' => true, 'create' => true, 'edit' => true, 'delete' => false, 'deleteAll' => false, 'importExcel' => true, 'exportExcel' => true],
            'commitments' => ['view' => true, 'create' => true, 'edit' => true, 'delete' => false, 'deleteAll' => false, 'print' => true, 'archive' => true, 'importExcel' => true, 'exportExcel' => true],
            'payroll' => ['view' => true, 'create' => true, 'edit' => true, 'delete' => false, 'deleteAll' => false, 'importExcel' => true, 'exportExcel' => true],
            'users' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false],
            'system' => ['dashboardStats' => true, 'backupDatabase' => false, 'restoreDatabase' => false],
            'smartDashboard' => ['view' => true, 'exportExcel' => true, 'print' => true],
            'ceoDashboard' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false, 'print' => false],
            'unitOperations' => ['view' => true, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => true, 'allowedUnits' => []],
            'canManagePersonnel' => true, 'canManageKaraneh' => false, 'canManageJobGroups' => true, 'canManageCommitments' => true,
            'canManageUsers' => false, 'canExportExcel' => true, 'canImportExcel' => true, 'canBackupRestore' => false,
        ];
    }
    if (containsStr($p, 'کارانه') || containsStr($p, 'حقوق')) {
        return [
            'personnel' => ['view' => true, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => true, 'viewSalary' => true, 'documents' => false],
            'karaneh' => ['view' => true, 'create' => true, 'edit' => true, 'delete' => false, 'deleteAll' => false, 'importExcel' => true, 'exportExcel' => true],
            'jobGroups' => ['view' => true, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => true],
            'commitments' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'print' => false, 'archive' => false, 'importExcel' => false, 'exportExcel' => false],
            'payroll' => ['view' => true, 'create' => true, 'edit' => true, 'delete' => false, 'deleteAll' => false, 'importExcel' => true, 'exportExcel' => true],
            'users' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false],
            'system' => ['dashboardStats' => true, 'backupDatabase' => false, 'restoreDatabase' => false],
            'smartDashboard' => ['view' => true, 'exportExcel' => true, 'print' => false],
            'ceoDashboard' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false, 'print' => false],
            'unitOperations' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false, 'allowedUnits' => []],
            'canManagePersonnel' => false, 'canManageKaraneh' => true, 'canManageJobGroups' => false, 'canManageCommitments' => false,
            'canManageUsers' => false, 'canExportExcel' => true, 'canImportExcel' => true, 'canBackupRestore' => false,
        ];
    }
    return [
        'personnel' => ['view' => true, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => true, 'viewSalary' => false, 'documents' => false],
        'karaneh' => ['view' => true, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => true],
        'jobGroups' => ['view' => true, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => true],
        'commitments' => ['view' => true, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'print' => true, 'archive' => false, 'importExcel' => false, 'exportExcel' => true],
        'payroll' => ['view' => true, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => true],
        'users' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false],
        'system' => ['dashboardStats' => true, 'backupDatabase' => false, 'restoreDatabase' => false],
        'smartDashboard' => ['view' => true, 'exportExcel' => true, 'print' => true],
        'ceoDashboard' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false, 'print' => false],
        'unitOperations' => ['view' => false, 'create' => false, 'edit' => false, 'delete' => false, 'deleteAll' => false, 'importExcel' => false, 'exportExcel' => false, 'allowedUnits' => []],
        'canManagePersonnel' => false, 'canManageKaraneh' => false, 'canManageJobGroups' => false, 'canManageCommitments' => false,
        'canManageUsers' => false, 'canExportExcel' => true, 'canImportExcel' => false, 'canBackupRestore' => false,
    ];
}

function normPayrollKey(string $key): string {
    $s = str_replace(["\u{200c}", 'ي', 'ك', 'أ', 'إ'], [' ', 'ی', 'ک', 'ا', 'ا'], $key);
    return trim((string)preg_replace('/\s+/', ' ', $s));
}

function getPayrollVal(array $row, string ...$keys) {
    foreach ($keys as $k) {
        if (array_key_exists($k, $row) && $row[$k] !== null && $row[$k] !== '') {
            return $row[$k];
        }
    }
    $normMap = [];
    foreach ($row as $rk => $rv) {
        if ($rv !== null && $rv !== '') {
            $nk = normPayrollKey((string)$rk);
            if (!array_key_exists($nk, $normMap)) {
                $normMap[$nk] = $rv;
            }
        }
    }
    foreach ($keys as $k) {
        $nk = normPayrollKey($k);
        if (array_key_exists($nk, $normMap)) {
            return $normMap[$nk];
        }
    }
    return null;
}

function parseNumPayroll($val) {
    if ($val === null || $val === '') return 0;
    if (is_int($val) || is_float($val)) return is_finite((float)$val) ? $val : 0;
    $persian = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹','٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
    $latin   = ['0','1','2','3','4','5','6','7','8','9','0','1','2','3','4','5','6','7','8','9'];
    $s = str_replace($persian, $latin, (string)$val);
    $s = str_replace([',', '٬', '،', ' ', 'ریال'], '', $s);
    if (!is_numeric($s)) return 0;
    $f = (float)$s;
    return ($f == floor($f)) ? (int)$f : $f;
}

function parseYearMonthPhp($rawYm, string $fallbackPeriod): string {
    $persian = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹','٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
    $latin   = ['0','1','2','3','4','5','6','7','8','9','0','1','2','3','4','5','6','7','8','9'];
    $eng = trim(str_replace($persian, $latin, (string)($rawYm ?? '')));
    if ($eng === '') return $fallbackPeriod;
    if (preg_match('/^(\d{4})\s*[-\/]\s*(\d{1,2})$/', $eng, $m)) {
        $mo = (int)$m[2];
        if ($mo >= 1 && $mo <= 12) return $m[1] . '-' . str_pad((string)$mo, 2, '0', STR_PAD_LEFT);
    }
    if (preg_match('/^(\d{4})(\d{2})$/', $eng, $m)) {
        $mo = (int)$m[2];
        if ($mo >= 1 && $mo <= 12) return $m[1] . '-' . $m[2];
    }
    return $fallbackPeriod;
}

function genId(string $prefix): string {
    return $prefix . '-' . (int)round(microtime(true) * 1000) . '-' . substr(bin2hex(random_bytes(3)), 0, 4);
}

$rawRoute = (string)($_GET['r'] ?? '/health');
$path = '/' . ltrim(explode('?', $rawRoute)[0], '/');
$method = strtoupper((string)($_GET['_method'] ?? $_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'] ?? $_SERVER['REQUEST_METHOD'] ?? 'GET'));

// 0. Health check
if ($method === 'GET' && $path === '/health') {
    jsonResponse(['success' => true, 'engine' => 'php']);
}

// 1. Auth: Login
if ($method === 'POST' && $path === '/auth/login') {
    $body = getJsonBody();
    $username = trim((string)($body['username'] ?? ''));
    $password = (string)($body['password'] ?? '');
    if ($username === '' || $password === '') {
        jsonResponse(['success' => false, 'message' => 'لطفاً نام کاربری و رمز عبور را وارد کنید.'], 400);
    }
    $result = withDbLock(function () use ($username, $password, $SERVER_SECRET) {
        $db = loadDatabase();
        foreach ($db['users'] as $idx => $u) {
            if (($u['username'] ?? '') === $username) {
                $check = verifyPasswordPhp($password, (string)($u['password'] ?? ''));
                if (!$check['valid']) {
                    return ['status' => 401, 'body' => ['success' => false, 'message' => 'نام کاربری یا رمز عبور اشتباه است.']];
                }
                if (empty($u['isActive'])) {
                    return ['status' => 403, 'body' => ['success' => false, 'message' => 'حساب کاربری شما غیرفعال شده است. لطفاً با مدیر ارشد تماس بگیرید.']];
                }
                if ($check['needsMigration']) {
                    $db['users'][$idx]['password'] = hashPasswordPhp($password);
                }
                $db['users'][$idx]['lastLogin'] = date('Y/m/d H:i');
                if (!saveDatabase($db)) {
                    return ['status' => 500, 'body' => ['success' => false, 'message' => 'خطا در ذخیره‌سازی نشست در پوشه سایت.']];
                }
                return [
                    'status' => 200,
                    'body' => [
                        'success' => true,
                        'data' => [
                            'user' => stripPassword($db['users'][$idx]),
                            'token' => createAuthToken($db['users'][$idx], $SERVER_SECRET),
                        ],
                    ],
                ];
            }
        }
        return ['status' => 401, 'body' => ['success' => false, 'message' => 'نام کاربری یا رمز عبور اشتباه است.']];
    });
    jsonResponse($result['body'], $result['status']);
}

// 1b. Auth: Firebase Google Login
if ($method === 'POST' && $path === '/auth/firebase-login') {
    $body = getJsonBody();
    $idToken = (string)($body['idToken'] ?? '');
    if ($idToken === '') {
        jsonResponse(['success' => false, 'message' => 'توکن احراز هویت گوگل ارسال نشده است.'], 400);
    }
    $jwtParts = explode('.', $idToken);
    if (count($jwtParts) !== 3) {
        jsonResponse(['success' => false, 'message' => 'ساختار توکن گوگل معتبر نیست.'], 401);
    }
    $payloadRaw = base64UrlDecode($jwtParts[1]);
    $decoded = $payloadRaw ? json_decode($payloadRaw, true) : null;
    if (!is_array($decoded) || empty($decoded['email']) || empty($decoded['email_verified'])) {
        jsonResponse(['success' => false, 'message' => 'حساب گوگل باید دارای ایمیل تأییدشده باشد.'], 401);
    }
    $audOk = ($decoded['aud'] ?? '') === FIREBASE_PROJECT_ID;
    $expOk = (int)($decoded['exp'] ?? 0) > time();
    if (!$audOk || !$expOk) {
        jsonResponse(['success' => false, 'message' => 'توکن گوگل منقضی یا متعلق به پروژه دیگری است.'], 401);
    }
    $email = strtolower(trim((string)$decoded['email']));
    $uid = (string)($decoded['user_id'] ?? $decoded['sub'] ?? '');

    $result = withDbLock(function () use ($email, $uid, $SERVER_SECRET) {
        $db = loadDatabase();
        $foundIdx = -1;
        foreach ($db['users'] as $idx => $u) {
            if ($email === 'javadabadiyangoshi@gmail.com') {
                if (($u['username'] ?? '') === 'javadabadiyan' || ($u['role'] ?? '') === 'super_admin') {
                    $foundIdx = $idx;
                    break;
                }
            } else {
                $localPart = explode('@', $email)[0];
                if (
                    (!empty($u['uid']) && $u['uid'] === $uid) ||
                    (!empty($u['email']) && strtolower(trim((string)$u['email'])) === $email) ||
                    (strtolower(trim((string)($u['username'] ?? ''))) === $localPart)
                ) {
                    $foundIdx = $idx;
                    break;
                }
            }
        }
        if ($foundIdx < 0) {
            return ['status' => 403, 'body' => ['success' => false, 'message' => "ایمیل {$email} در لیست کاربران مجاز سامانه ثبت نشده است."]];
        }
        if (empty($db['users'][$foundIdx]['isActive'])) {
            return ['status' => 403, 'body' => ['success' => false, 'message' => 'حساب کاربری شما غیرفعال شده است.']];
        }
        $db['users'][$foundIdx]['uid'] = $uid;
        $db['users'][$foundIdx]['email'] = $email;
        $db['users'][$foundIdx]['lastLogin'] = date('Y/m/d H:i');
        saveDatabase($db);
        return [
            'status' => 200,
            'body' => [
                'success' => true,
                'data' => [
                    'user' => stripPassword($db['users'][$foundIdx]),
                    'token' => createAuthToken($db['users'][$foundIdx], $SERVER_SECRET),
                ],
            ],
        ];
    });
    jsonResponse($result['body'], $result['status']);
}

// 1c. Auth: Me
if ($method === 'GET' && $path === '/auth/me') {
    $db = loadDatabase();
    $user = requireAuthUser($db, $SERVER_SECRET);
    jsonResponse(['success' => true, 'data' => stripPassword($user)]);
}

// ================= AUTHENTICATED ROUTES =================

// 2. Users
if ($method === 'GET' && $path === '/users') {
    $db = loadDatabase();
    $user = requireAuthUser($db, $SERVER_SECRET);
    if (!checkPermission($user, 'users', 'view')) {
        jsonResponse(['success' => true, 'data' => []]);
    }
    jsonResponse(['success' => true, 'data' => array_map('stripPassword', $db['users'])]);
}

if ($method === 'POST' && $path === '/users') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'users', 'create');
        $username = trim((string)($body['username'] ?? ''));
        $password = (string)($body['password'] ?? '');
        $fullName = trim((string)($body['fullName'] ?? ''));
        if ($username === '' || $password === '' || $fullName === '') {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'تکمیل نام کاربری، رمز عبور و نام الزامی است.']];
        }
        foreach ($db['users'] as $u) {
            if (strtolower((string)$u['username']) === strtolower($username)) {
                return ['status' => 400, 'body' => ['success' => false, 'message' => 'این نام کاربری قبلاً در سامانه ثبت شده است.']];
            }
        }
        $newUser = [
            'id' => 'u-' . (int)round(microtime(true) * 1000),
            'username' => $username,
            'password' => hashPasswordPhp($password),
            'email' => !empty($body['email']) ? strtolower(trim((string)$body['email'])) : '',
            'fullName' => $fullName,
            'role' => $body['role'] ?? 'viewer',
            'department' => $body['department'] ?? '',
            'permissions' => $body['permissions'] ?? buildPresetPermissions('مشاهده‌گر'),
            'isActive' => true,
            'createdAt' => date('Y/m/d'),
        ];
        $db['users'][] = $newUser;
        if (!saveDatabase($db)) {
            return ['status' => 500, 'body' => ['success' => false, 'message' => 'خطا در ذخیره‌سازی کاربر در پایگاه داده.']];
        }
        return ['status' => 200, 'body' => ['success' => true, 'data' => stripPassword($newUser), 'message' => 'کاربر جدید با موفقیت ذخیره شد.']];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/users/batch-import') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        if (!checkPermission($authUser, 'users', 'importExcel') && !checkPermission($authUser, 'users', 'create')) {
            return ['status' => 403, 'body' => ['success' => false, 'message' => 'شما مجوز بارگذاری اکسل کاربران را ندارید.']];
        }
        $items = $body['items'] ?? [];
        if (!is_array($items) || count($items) === 0) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'فایل اکسل کاربران خالی است.']];
        }
        $added = 0;
        $updated = 0;
        foreach ($items as $row) {
            $username = trim((string)($row['username'] ?? $row['نام کاربری'] ?? ''));
            $fullName = trim((string)($row['fullName'] ?? $row['نام و نام خانوادگی'] ?? ''));
            if ($username === '' || $fullName === '' || strtolower($username) === 'javadabadiyan') continue;
            $role = trim((string)($row['role'] ?? $row['نقش سازمانی'] ?? 'کارشناس اداری'));
            $department = trim((string)($row['department'] ?? $row['واحد اداری'] ?? ''));
            $rawActive = trim((string)($row['isActive'] ?? $row['وضعیت حساب'] ?? 'فعال'));
            $isActive = !in_array($rawActive, ['غیرفعال', 'مسدود', 'false', '0'], true);
            $presetLabel = trim((string)($row['preset'] ?? $row['الگوی دسترسی'] ?? 'مشاهده‌گر'));
            $rawPass = trim((string)($row['password'] ?? $row['رمز عبور'] ?? ''));

            $foundIdx = -1;
            foreach ($db['users'] as $i => $u) {
                if (strtolower((string)$u['username']) === strtolower($username)) {
                    $foundIdx = $i;
                    break;
                }
            }
            if ($foundIdx >= 0) {
                $existing = $db['users'][$foundIdx];
                $db['users'][$foundIdx] = array_merge($existing, [
                    'fullName' => $fullName,
                    'role' => $role,
                    'department' => $department,
                    'isActive' => $isActive,
                    'permissions' => !empty($row['الگوی دسترسی']) ? buildPresetPermissions($presetLabel) : ($existing['permissions'] ?? []),
                    'password' => $rawPass !== '' ? hashPasswordPhp($rawPass) : ($existing['password'] ?? ''),
                ]);
                $updated++;
            } else {
                $db['users'][] = [
                    'id' => genId('u'),
                    'username' => $username,
                    'password' => hashPasswordPhp($rawPass !== '' ? $rawPass : '12345678'),
                    'fullName' => $fullName,
                    'role' => $role,
                    'department' => $department,
                    'isActive' => $isActive,
                    'permissions' => buildPresetPermissions($presetLabel),
                    'createdAt' => date('Y/m/d'),
                ];
                $added++;
            }
        }
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'message' => "بارگذاری کاربران از اکسل با موفقیت انجام شد ({$added} کاربر جدید، {$updated} کاربر به‌روزرسانی شد)."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/users/batch-delete') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'users', 'delete');
        $ids = $body['ids'] ?? [];
        if (!is_array($ids) || count($ids) === 0) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'موردی برای حذف انتخاب نشده است.']];
        }
        $idMap = array_flip(array_map('strval', $ids));
        $before = count($db['users']);
        $db['users'] = array_values(array_filter($db['users'], function ($u) use ($idMap, $authUser) {
            $id = (string)($u['id'] ?? '');
            if (!isset($idMap[$id])) return true;
            if (($u['username'] ?? '') === 'javadabadiyan' || $id === ($authUser['id'] ?? '')) return true;
            return false;
        }));
        $deletedCount = $before - count($db['users']);
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => "{$deletedCount} کاربر با موفقیت حذف گردید."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/users/delete-all') {
    $result = withDbLock(function () use ($SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'users', 'deleteAll');
        createSafetySnapshot('pre_delete_all_users');
        $before = count($db['users']);
        $db['users'] = array_values(array_filter($db['users'], fn($u) => (($u['username'] ?? '') === 'javadabadiyan') || (($u['id'] ?? '') === ($authUser['id'] ?? ''))));
        $deletedCount = $before - count($db['users']);
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => "{$deletedCount} حساب کاربری حذف شدند (حساب مدیر ارشد و کاربر جاری حفظ گردید)."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if (preg_match('#^/users/([^/]+)$#', $path, $m)) {
    $id = urldecode($m[1]);
    if ($method === 'PUT') {
        $body = getJsonBody();
        $result = withDbLock(function () use ($id, $body, $SERVER_SECRET) {
            $db = loadDatabase();
            $authUser = requireAuthUser($db, $SERVER_SECRET);
            requirePerm($authUser, 'users', 'edit');
            foreach ($db['users'] as $i => $existing) {
                if (($existing['id'] ?? '') === $id) {
                    if (($existing['username'] ?? '') === 'javadabadiyan' && ($body['isActive'] ?? true) === false) {
                        return ['status' => 400, 'body' => ['success' => false, 'message' => 'حساب ادمین ارشد (javadabadiyan) قابل غیرفعال‌سازی نیست.']];
                    }
                    $updated = $existing;
                    if (array_key_exists('fullName', $body)) $updated['fullName'] = $body['fullName'];
                    if (array_key_exists('email', $body)) $updated['email'] = strtolower(trim((string)$body['email']));
                    if (array_key_exists('role', $body)) $updated['role'] = $body['role'];
                    if (array_key_exists('department', $body)) $updated['department'] = $body['department'];
                    if (array_key_exists('permissions', $body)) $updated['permissions'] = $body['permissions'];
                    if (array_key_exists('isActive', $body)) $updated['isActive'] = (bool)$body['isActive'];
                    if (!empty($body['password'])) $updated['password'] = hashPasswordPhp((string)$body['password']);
                    $db['users'][$i] = $updated;
                    saveDatabase($db);
                    return ['status' => 200, 'body' => ['success' => true, 'data' => stripPassword($updated), 'message' => 'اطلاعات و دسترسی‌های کاربر با موفقیت به‌روزرسانی شد.']];
                }
            }
            return ['status' => 404, 'body' => ['success' => false, 'message' => 'کاربر یافت نشد.']];
        });
        jsonResponse($result['body'], $result['status']);
    }
    if ($method === 'DELETE') {
        $result = withDbLock(function () use ($id, $SERVER_SECRET) {
            $db = loadDatabase();
            $authUser = requireAuthUser($db, $SERVER_SECRET);
            requirePerm($authUser, 'users', 'delete');
            $target = null;
            foreach ($db['users'] as $u) {
                if (($u['id'] ?? '') === $id) {
                    $target = $u;
                    break;
                }
            }
            if (!$target) {
                return ['status' => 404, 'body' => ['success' => false, 'message' => 'کاربر یافت نشد.']];
            }
            if (($target['username'] ?? '') === 'javadabadiyan') {
                return ['status' => 400, 'body' => ['success' => false, 'message' => 'امکان حذف کاربر ارشد سامانه (javadabadiyan) وجود ندارد.']];
            }
            $db['users'] = array_values(array_filter($db['users'], fn($u) => ($u['id'] ?? '') !== $id));
            saveDatabase($db);
            return ['status' => 200, 'body' => ['success' => true, 'message' => 'کاربر با موفقیت حذف گردید.']];
        });
        jsonResponse($result['body'], $result['status']);
    }
}

// 3. Personnel
if ($method === 'GET' && $path === '/personnel') {
    $db = loadDatabase();
    $authUser = requireAuthUser($db, $SERVER_SECRET);
    if (!checkPermission($authUser, 'personnel', 'view')) {
        jsonResponse(['success' => true, 'data' => []]);
    }
    $canViewSalary = checkPermission($authUser, 'personnel', 'viewSalary');
    $canViewDocs = checkPermission($authUser, 'personnel', 'documents');
    $list = array_map(function ($p) use ($canViewSalary, $canViewDocs) {
        if (!$canViewSalary) $p['baseSalary'] = 0;
        if (!$canViewDocs) unset($p['documents']);
        return $p;
    }, $db['personnel']);
    jsonResponse(['success' => true, 'data' => $list]);
}

if ($method === 'POST' && $path === '/personnel') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'personnel', 'create');
        if (empty($body['personnelCode']) || empty($body['firstName']) || empty($body['lastName'])) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'کد پرسنلی، نام و نام خانوادگی الزامی هستند.']];
        }
        foreach ($db['personnel'] as $p) {
            if (($p['personnelCode'] ?? '') === $body['personnelCode']) {
                return ['status' => 400, 'body' => ['success' => false, 'message' => "کد پرسنلی {$body['personnelCode']} قبلاً برای پرسنل دیگری ثبت شده است."]];
            }
        }
        $newP = array_merge($body, [
            'id' => 'p-' . (int)round(microtime(true) * 1000),
            'fullName' => trim(($body['firstName'] ?? '') . ' ' . ($body['lastName'] ?? '')) ?: (string)($body['fullName'] ?? ''),
            'relatives' => is_array($body['relatives'] ?? null) ? $body['relatives'] : [],
            'createdAt' => $body['createdAt'] ?? date('Y/m/d'),
            'updatedAt' => date('Y/m/d'),
        ]);
        $db['personnel'][] = $newP;
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'data' => $newP, 'message' => 'پرسنل جدید با موفقیت در پرونده‌های سازمانی ثبت گردید.']];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/personnel/batch-import') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'personnel', 'importExcel');
        $items = $body['items'] ?? [];
        if (!is_array($items) || count($items) === 0) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'هیچ رکوردی برای بارگذاری ارسال نشده است.']];
        }
        $added = 0;
        $updated = 0;
        foreach ($items as $row) {
            if (!is_array($row)) continue;
            $code = trim((string)(getPayrollVal($row, 'personnelCode', 'كد پرسنلي', 'کد پرسنلی') ?? ''));
            if ($code === '') continue;
            $firstName = trim((string)(getPayrollVal($row, 'firstName', 'نام') ?? ''));
            $lastName = trim((string)(getPayrollVal($row, 'lastName', 'نام خانوادگي', 'نام خانوادگی') ?? ''));
            $fullName = trim($firstName . ' ' . $lastName);
            if ($fullName === '') {
                $fullName = trim((string)(getPayrollVal($row, 'fullName', 'نام و نام خانوادگي', 'نام و نام خانوادگی') ?? 'پرسنل'));
            }
            $parts = explode(' ', $fullName, 2);
            $idx = -1;
            foreach ($db['personnel'] as $i => $p) {
                if (trim((string)($p['personnelCode'] ?? '')) === $code) {
                    $idx = $i;
                    break;
                }
            }
            $existing = $idx >= 0 ? $db['personnel'][$idx] : [];
            $itemData = [
                'employeeId' => (string)(getPayrollVal($row, 'employeeId', 'شناسه كارمند', 'شناسه کارمند') ?? $existing['employeeId'] ?? ''),
                'personnelCode' => $code,
                'firstName' => $firstName !== '' ? $firstName : ($parts[0] ?? ''),
                'lastName' => $lastName !== '' ? $lastName : ($parts[1] ?? ''),
                'fullName' => $fullName,
                'fatherName' => (string)(getPayrollVal($row, 'fatherName', 'نام پدر') ?? $existing['fatherName'] ?? ''),
                'shenasnamehNumber' => (string)(getPayrollVal($row, 'shenasnamehNumber', 'شماره شناسنامه') ?? $existing['shenasnamehNumber'] ?? ''),
                'nationalId' => (string)(getPayrollVal($row, 'nationalId', 'كد ملي', 'کد ملی') ?? $existing['nationalId'] ?? ''),
                'nationality' => (string)(getPayrollVal($row, 'nationality', 'مليت', 'ملیت') ?? $existing['nationality'] ?? 'ایرانی'),
                'citizenship' => (string)(getPayrollVal($row, 'citizenship', 'تابعيت', 'تابعیت') ?? $existing['citizenship'] ?? 'جمهوری اسلامی ایران'),
                'gender' => (string)(getPayrollVal($row, 'gender', 'جنسيت', 'جنسیت') ?? $existing['gender'] ?? ''),
                'phone' => (string)(getPayrollVal($row, 'phone', 'تلفن همراه', 'شماره تماس', 'تلفن') ?? $existing['phone'] ?? ''),
                'email' => (string)(getPayrollVal($row, 'email', 'پست الكترونيك', 'پست الکترونیک', 'ایمیل') ?? $existing['email'] ?? ''),
                'birthPlace' => (string)(getPayrollVal($row, 'birthPlace', 'محل تولد') ?? $existing['birthPlace'] ?? ''),
                'issuePlace' => (string)(getPayrollVal($row, 'issuePlace', 'محل صدور') ?? $existing['issuePlace'] ?? ''),
                'birthDate' => (string)(getPayrollVal($row, 'birthDate', 'تاريخ تولد', 'تاریخ تولد') ?? $existing['birthDate'] ?? ''),
                'issueDate' => (string)(getPayrollVal($row, 'issueDate', 'تاريخ صدور', 'تاریخ صدور') ?? $existing['issueDate'] ?? ''),
                'maritalStatus' => (string)(getPayrollVal($row, 'maritalStatus', 'وضعيت تاهل', 'وضعیت تاهل', 'وضعیت تأهل') ?? $existing['maritalStatus'] ?? ''),
                'militaryStatus' => (string)(getPayrollVal($row, 'militaryStatus', 'وضعيت نظام وظيفه', 'وضعیت نظام وظیفه') ?? $existing['militaryStatus'] ?? ''),
                'education' => (string)(getPayrollVal($row, 'education', 'مدرك تحصيلي', 'مدرک تحصیلی', 'تحصیلات') ?? $existing['education'] ?? ''),
                'fieldOfStudy' => (string)(getPayrollVal($row, 'fieldOfStudy', 'رشته تحصيلي', 'رشته تحصیلی') ?? $existing['fieldOfStudy'] ?? ''),
                'hireDate' => (string)(getPayrollVal($row, 'hireDate', 'تاريخ استخدام', 'تاریخ استخدام') ?? $existing['hireDate'] ?? '1403/01/01'),
                'workLocation' => (string)(getPayrollVal($row, 'workLocation', 'محل خدمت') ?? $existing['workLocation'] ?? ''),
                'department' => (string)(getPayrollVal($row, 'department', 'واحد سازماني', 'واحد سازمانی', 'واحد') ?? $existing['department'] ?? 'عمومی'),
                'jobTitle' => (string)(getPayrollVal($row, 'jobTitle', 'شغل') ?? $existing['jobTitle'] ?? ''),
                'jobCode' => (string)(getPayrollVal($row, 'jobCode', 'كد شغل', 'کد شغل') ?? $existing['jobCode'] ?? ''),
                'position' => (string)(getPayrollVal($row, 'position', 'پست', 'پست و سمت', 'پست سازمانی') ?? $existing['position'] ?? 'کارشناس'),
                'positionCode' => (string)(getPayrollVal($row, 'positionCode', 'كد پست', 'کد پست') ?? $existing['positionCode'] ?? ''),
                'employmentType' => (string)(getPayrollVal($row, 'employmentType', 'نوع استخدام') ?? $existing['employmentType'] ?? 'قراردادی'),
                'jobGroupId' => (string)(getPayrollVal($row, 'jobGroupId') ?? $existing['jobGroupId'] ?? ''),
                'status' => (string)(getPayrollVal($row, 'status', 'وضعیت') ?? $existing['status'] ?? 'فعال'),
                'baseSalary' => (float)(getPayrollVal($row, 'baseSalary', 'حقوق پایه', 'حقوق پایه (ریال)') ?? $existing['baseSalary'] ?? 0),
                'notes' => (string)(getPayrollVal($row, 'notes', 'یادداشت', 'توضیحات') ?? $existing['notes'] ?? ''),
                'updatedAt' => date('Y/m/d'),
            ];
            if ($idx >= 0) {
                $db['personnel'][$idx] = array_merge($db['personnel'][$idx], $itemData);
                $updated++;
            } else {
                $db['personnel'][] = array_merge(['id' => genId('p')], $itemData, ['relatives' => [], 'createdAt' => date('Y/m/d')]);
                $added++;
            }
        }
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'message' => "ورود اطلاعات با موفقیت انجام شد: {$added} نفر جدید اضافه شدند و {$updated} پرونده به‌روزرسانی گردید."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/personnel/batch-delete') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'personnel', 'delete');
        $ids = $body['ids'] ?? [];
        if (!is_array($ids) || count($ids) === 0) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'موردی برای حذف انتخاب نشده است.']];
        }
        $idMap = array_flip(array_map('strval', $ids));
        $before = count($db['personnel']);
        $db['personnel'] = array_values(array_filter($db['personnel'], fn($p) => !isset($idMap[(string)($p['id'] ?? '')])));
        $deletedCount = $before - count($db['personnel']);
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => "{$deletedCount} پرونده پرسنلی با موفقیت حذف شد."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/personnel/delete-all') {
    $result = withDbLock(function () use ($SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'personnel', 'deleteAll');
        createSafetySnapshot('pre_delete_all_personnel');
        $deletedCount = count($db['personnel']);
        $db['personnel'] = [];
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => "کل جدول پرسنل ({$deletedCount} پرونده) با موفقیت پاکسازی شد."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/personnel/relatives/batch-import') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'personnel', 'importExcel');
        $items = $body['items'] ?? [];
        if (!is_array($items) || count($items) === 0) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'لیست بستگان جهت بارگذاری خالی است.']];
        }
        $added = 0; $updated = 0; $unmatched = 0;
        foreach ($items as $row) {
            if (!is_array($row)) continue;
            $pCode = trim((string)(getPayrollVal($row, 'personnelCode', 'كد پرسنلي', 'کد پرسنلی') ?? ''));
            $pEmpId = trim((string)(getPayrollVal($row, 'employeeId', 'شناسه كارمند', 'شناسه کارمند') ?? ''));
            $pNatId = trim((string)(getPayrollVal($row, 'personnelNationalId', 'کد ملی کارمند', 'کد ملی پرسنل') ?? ''));
            $pName = normPayrollKey((string)(getPayrollVal($row, 'personnelName', 'نام کارمند', 'نام پرسنل', 'نام و نام خانوادگی کارمند') ?? ''));
            $parentIdx = -1;
            foreach ($db['personnel'] as $i => $p) {
                if (
                    ($pCode !== '' && trim((string)($p['personnelCode'] ?? '')) === $pCode) ||
                    ($pEmpId !== '' && trim((string)($p['employeeId'] ?? '')) === $pEmpId) ||
                    ($pNatId !== '' && trim((string)($p['nationalId'] ?? '')) === $pNatId) ||
                    ($pName !== '' && normPayrollKey((string)($p['fullName'] ?? '')) === $pName)
                ) {
                    $parentIdx = $i;
                    break;
                }
            }
            if ($parentIdx < 0) { $unmatched++; continue; }
            $relFullName = trim((string)(getPayrollVal($row, 'fullName', 'نام و نام خانوادگی بستگان', 'نام بستگان', 'نام و نام خانوادگی') ?? ''));
            if ($relFullName === '') continue;
            $relation = trim((string)(getPayrollVal($row, 'relation', 'نسبت', 'نسبت با کارمند') ?? 'سایر'));
            $relNationalId = trim((string)(getPayrollVal($row, 'nationalId', 'کد ملی بستگان', 'كد ملي', 'کد ملی') ?? ''));
            $rawDep = trim((string)(getPayrollVal($row, 'isDependent', 'تحت تکفل', 'تحت تکفل؟') ?? ''));
            $rawIns = trim((string)(getPayrollVal($row, 'insuranceCovered', 'بیمه تکمیلی', 'مشمول بیمه', 'بیمه') ?? ''));
            $isDep = $rawDep === '' ? true : !in_array($rawDep, ['خیر', 'نه', 'false', '0', 'ندارد'], true);
            $insCov = $rawIns === '' ? $isDep : !in_array($rawIns, ['خیر', 'نه', 'false', '0', 'ندارد'], true);
            if (!isset($db['personnel'][$parentIdx]['relatives']) || !is_array($db['personnel'][$parentIdx]['relatives'])) {
                $db['personnel'][$parentIdx]['relatives'] = [];
            }
            $existingIdx = -1;
            foreach ($db['personnel'][$parentIdx]['relatives'] as $ri => $rel) {
                if (
                    ($relNationalId !== '' && trim((string)($rel['nationalId'] ?? '')) === $relNationalId) ||
                    (normPayrollKey((string)($rel['fullName'] ?? '')) === normPayrollKey($relFullName) && normPayrollKey((string)($rel['relation'] ?? '')) === normPayrollKey($relation))
                ) {
                    $existingIdx = $ri;
                    break;
                }
            }
            $parent = $db['personnel'][$parentIdx];
            $relPayload = [
                'id' => $existingIdx >= 0 ? ($parent['relatives'][$existingIdx]['id'] ?? genId('rel')) : genId('rel'),
                'personnelId' => $parent['id'],
                'personnelCode' => $parent['personnelCode'],
                'personnelName' => $parent['fullName'],
                'fullName' => $relFullName,
                'relation' => $relation,
                'nationalId' => $relNationalId,
                'shenasnamehNumber' => (string)(getPayrollVal($row, 'shenasnamehNumber', 'شماره شناسنامه') ?? ''),
                'fatherName' => (string)(getPayrollVal($row, 'fatherName', 'نام پدر') ?? ''),
                'birthDate' => (string)(getPayrollVal($row, 'birthDate', 'تاریخ تولد', 'تاريخ تولد') ?? ''),
                'gender' => (string)(getPayrollVal($row, 'gender', 'جنسیت', 'جنسيت') ?? ''),
                'phone' => (string)(getPayrollVal($row, 'phone', 'تلفن همراه', 'شماره تماس') ?? ''),
                'education' => (string)(getPayrollVal($row, 'education', 'تحصیلات', 'مدرک تحصیلی') ?? ''),
                'isDependent' => $isDep,
                'insuranceCovered' => $insCov,
                'notes' => (string)(getPayrollVal($row, 'notes', 'توضیحات', 'یادداشت') ?? ''),
                'updatedAt' => date('Y/m/d'),
                'createdAt' => $existingIdx >= 0 ? ($parent['relatives'][$existingIdx]['createdAt'] ?? date('Y/m/d')) : date('Y/m/d'),
            ];
            if ($existingIdx >= 0) {
                $db['personnel'][$parentIdx]['relatives'][$existingIdx] = array_merge($db['personnel'][$parentIdx]['relatives'][$existingIdx], $relPayload);
                $updated++;
            } else {
                $db['personnel'][$parentIdx]['relatives'][] = $relPayload;
                $added++;
            }
            $db['personnel'][$parentIdx]['updatedAt'] = date('Y/m/d');
        }
        saveDatabase($db);
        $extra = $unmatched > 0 ? "، {$unmatched} ردیف بدون تطابق کد پرسنلی" : '';
        return ['status' => 200, 'body' => ['success' => true, 'added' => $added, 'updated' => $updated, 'unmatched' => $unmatched, 'message' => "اطلاعات بستگان با موفقیت ذخیره شد ({$added} جدید، {$updated} به‌روزرسانی{$extra})."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/personnel/relatives/delete-all') {
    $result = withDbLock(function () use ($SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'personnel', 'deleteAll');
        createSafetySnapshot('pre_delete_all_relatives');
        $deletedCount = 0;
        foreach ($db['personnel'] as $i => $p) {
            if (!empty($p['relatives']) && is_array($p['relatives'])) {
                $deletedCount += count($p['relatives']);
                $db['personnel'][$i]['relatives'] = [];
            }
        }
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => "تمامی اطلاعات بستگان پرسنل ({$deletedCount} رکورد) پاکسازی شد."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if (preg_match('#^/personnel/([^/]+)$#', $path, $m)) {
    $id = urldecode($m[1]);
    if ($method === 'PUT') {
        $body = getJsonBody();
        $result = withDbLock(function () use ($id, $body, $SERVER_SECRET) {
            $db = loadDatabase();
            $authUser = requireAuthUser($db, $SERVER_SECRET);
            requirePerm($authUser, 'personnel', 'edit');
            $idx = -1;
            foreach ($db['personnel'] as $i => $p) {
                if (($p['id'] ?? '') === $id) {
                    $idx = $i;
                    break;
                }
            }
            if ($idx < 0) return ['status' => 404, 'body' => ['success' => false, 'message' => 'پرسنل یافت نشد.']];
            if (!empty($body['personnelCode']) && $body['personnelCode'] !== ($db['personnel'][$idx]['personnelCode'] ?? '')) {
                foreach ($db['personnel'] as $p) {
                    if (($p['id'] ?? '') !== $id && ($p['personnelCode'] ?? '') === $body['personnelCode']) {
                        return ['status' => 400, 'body' => ['success' => false, 'message' => "کد پرسنلی {$body['personnelCode']} متعلق به شخص دیگری است."]];
                    }
                }
            }
            $prev = $db['personnel'][$idx];
            $merged = array_merge($prev, $body);
            if (!empty($body['firstName']) && !empty($body['lastName'])) {
                $merged['fullName'] = trim($body['firstName'] . ' ' . $body['lastName']);
            }
            if (!array_key_exists('relatives', $body)) {
                $merged['relatives'] = $prev['relatives'] ?? [];
            }
            $merged['updatedAt'] = date('Y/m/d');
            $db['personnel'][$idx] = $merged;
            saveDatabase($db);
            return ['status' => 200, 'body' => ['success' => true, 'data' => $merged, 'message' => 'اطلاعات پرسنلی با موفقیت ویرایش شد.']];
        });
        jsonResponse($result['body'], $result['status']);
    }
    if ($method === 'DELETE') {
        $result = withDbLock(function () use ($id, $SERVER_SECRET) {
            $db = loadDatabase();
            $authUser = requireAuthUser($db, $SERVER_SECRET);
            requirePerm($authUser, 'personnel', 'delete');
            $target = null;
            foreach ($db['personnel'] as $p) {
                if (($p['id'] ?? '') === $id) {
                    $target = $p;
                    break;
                }
            }
            if (!$target) return ['status' => 404, 'body' => ['success' => false, 'message' => 'پرسنل یافت نشد.']];
            $db['personnel'] = array_values(array_filter($db['personnel'], fn($p) => ($p['id'] ?? '') !== $id));
            $db['commitments'] = array_values(array_filter($db['commitments'], fn($c) => ($c['personnelId'] ?? '') !== $id && ($c['personnelCode'] ?? '') !== ($target['personnelCode'] ?? '')));
            saveDatabase($db);
            return ['status' => 200, 'body' => ['success' => true, 'message' => "پرسنل {$target['fullName']} با موفقیت از سیستم حذف شد."]];
        });
        jsonResponse($result['body'], $result['status']);
    }
}

// 4. Karaneh
if ($method === 'GET' && $path === '/karaneh') {
    $db = loadDatabase();
    $authUser = requireAuthUser($db, $SERVER_SECRET);
    if (!checkPermission($authUser, 'karaneh', 'view')) {
        jsonResponse(['success' => true, 'data' => []]);
    }
    $period = $_GET['period'] ?? '';
    $list = $db['karaneh'];
    if ($period !== '') {
        $list = array_values(array_filter($list, fn($k) => ($k['period'] ?? '') === $period));
    }
    jsonResponse(['success' => true, 'data' => $list]);
}

if ($method === 'GET' && $path === '/karaneh/comparison') {
    $db = loadDatabase();
    $authUser = requireAuthUser($db, $SERVER_SECRET);
    requirePerm($authUser, 'karaneh', 'view');
    $currentPeriod = (string)($_GET['currentPeriod'] ?? '1403-08');
    $previousPeriod = (string)($_GET['previousPeriod'] ?? '1403-07');
    $currentRecords = array_values(array_filter($db['karaneh'], fn($k) => ($k['period'] ?? '') === $currentPeriod));
    $previousRecords = array_values(array_filter($db['karaneh'], fn($k) => ($k['period'] ?? '') === $previousPeriod));
    $prevMap = [];
    foreach ($previousRecords as $prev) {
        $prevMap[trim((string)($prev['personnelCode'] ?? ''))] = $prev;
    }
    $rows = [];
    $totalCurrent = 0;
    $totalPrevious = 0;
    $countInc = 0;
    $countDec = 0;
    $countUnc = 0;
    $countNew = 0;
    foreach ($currentRecords as $curr) {
        $code = trim((string)($curr['personnelCode'] ?? ''));
        $prev = $prevMap[$code] ?? null;
        $prevFinal = $prev ? (float)($prev['finalKaraneh'] ?? 0) : 0;
        $currFinal = (float)($curr['finalKaraneh'] ?? 0);
        $diff = $currFinal - $prevFinal;
        $diffPct = $prevFinal > 0 ? round(($diff / $prevFinal) * 100, 1) : ($currFinal > 0 ? 100 : 0);
        $trend = 'unchanged';
        if (!$prev) { $trend = 'new'; $countNew++; }
        elseif ($diff > 0) { $trend = 'increase'; $countInc++; }
        elseif ($diff < 0) { $trend = 'decrease'; $countDec++; }
        else { $countUnc++; }
        $totalCurrent += $currFinal;
        $totalPrevious += $prevFinal;
        $rows[] = [
            'id' => $curr['id'] ?? '',
            'personnelId' => $curr['personnelId'] ?? '',
            'personnelCode' => $curr['personnelCode'] ?? '',
            'fullName' => $curr['fullName'] ?? '',
            'department' => $curr['department'] ?? '',
            'position' => $curr['position'] ?? '',
            'currentKaraneh' => $currFinal,
            'previousKaraneh' => $prevFinal,
            'diffAmount' => $diff,
            'diffPercent' => $diffPct,
            'trend' => $trend,
            'notes' => $curr['notes'] ?? '',
        ];
    }
    $totalDiff = $totalCurrent - $totalPrevious;
    $growth = $totalPrevious > 0 ? round(($totalDiff / $totalPrevious) * 100, 1) : 0;
    jsonResponse([
        'success' => true,
        'data' => [
            'currentPeriod' => $currentPeriod,
            'previousPeriod' => $previousPeriod,
            'comparisonRows' => $rows,
            'summary' => [
                'totalEmployees' => count($rows),
                'totalCurrent' => $totalCurrent,
                'totalPrevious' => $totalPrevious,
                'totalDiff' => $totalDiff,
                'overallGrowthPercent' => $growth,
                'countIncreased' => $countInc,
                'countDecreased' => $countDec,
                'countUnchanged' => $countUnc,
                'countNew' => $countNew,
            ],
        ],
    ]);
}

if ($method === 'POST' && $path === '/karaneh') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'karaneh', !empty($body['id']) ? 'edit' : 'create');
        if (empty($body['personnelCode']) || empty($body['period'])) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'کد پرسنلی و دوره کارانه الزامی است.']];
        }
        $code = trim((string)$body['personnelCode']);
        $period = (string)$body['period'];
        $existingIdx = -1;
        foreach ($db['karaneh'] as $i => $k) {
            if (trim((string)($k['personnelCode'] ?? '')) === $code && ($k['period'] ?? '') === $period) {
                $existingIdx = $i;
                break;
            }
        }
        $base = (float)($body['baseKaraneh'] ?? 0);
        $bonus = (float)($body['overtimeBonus'] ?? 0);
        $ded = (float)($body['deductions'] ?? 0);
        $final = array_key_exists('finalKaraneh', $body) ? (float)$body['finalKaraneh'] : ($base + $bonus - $ded);
        $rec = [
            'id' => $existingIdx >= 0 ? $db['karaneh'][$existingIdx]['id'] : ('k-' . (int)round(microtime(true) * 1000)),
            'personnelId' => $body['personnelId'] ?? '',
            'personnelCode' => $code,
            'fullName' => $body['fullName'] ?? 'پرسنل',
            'department' => $body['department'] ?? 'عمومی',
            'position' => $body['position'] ?? '',
            'period' => $period,
            'baseKaraneh' => $base,
            'overtimeBonus' => $bonus,
            'deductions' => $ded,
            'finalKaraneh' => $final,
            'notes' => $body['notes'] ?? '',
            'updatedAt' => date('Y/m/d'),
        ];
        if ($existingIdx >= 0) $db['karaneh'][$existingIdx] = $rec;
        else $db['karaneh'][] = $rec;
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'data' => $rec, 'message' => 'کارانه پرسنل با موفقیت ثبت شد.']];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/karaneh/batch-import') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'karaneh', 'importExcel');
        $period = (string)($body['period'] ?? '');
        $items = $body['items'] ?? [];
        if ($period === '' || !is_array($items) || count($items) === 0) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'دوره کارانه و لیست رکوردها الزامی است.']];
        }
        $count = 0;
        foreach ($items as $row) {
            $code = trim((string)($row['personnelCode'] ?? $row['کد پرسنلی'] ?? ''));
            if ($code === '') continue;
            $mp = null;
            foreach ($db['personnel'] as $p) {
                if (trim((string)($p['personnelCode'] ?? '')) === $code) { $mp = $p; break; }
            }
            $base = (float)($row['baseKaraneh'] ?? $row['کارانه پایه (ریال)'] ?? $row['کارانه پایه'] ?? 0);
            $bonus = (float)($row['overtimeBonus'] ?? $row['پاداش تشویقی (ریال)'] ?? $row['پاداش تشویقی'] ?? $row['اضافه کاری'] ?? 0);
            $ded = (float)($row['deductions'] ?? $row['کسورات (ریال)'] ?? $row['کسورات'] ?? 0);
            $explicitFinal = $row['finalKaraneh'] ?? $row['مبلغ کارانه (ریال)'] ?? $row['مبلغ کارانه'] ?? $row['کارانه خالص نهایی (ریال)'] ?? $row['کارانه خالص'] ?? $row['کارانه'] ?? $row['مبلغ'] ?? $row['amount'] ?? null;
            $final = $explicitFinal !== null ? (float)$explicitFinal : ($base + $bonus - $ded);
            $existingIdx = -1;
            foreach ($db['karaneh'] as $i => $k) {
                if (trim((string)($k['personnelCode'] ?? '')) === $code && ($k['period'] ?? '') === $period) { $existingIdx = $i; break; }
            }
            $rec = [
                'id' => $existingIdx >= 0 ? $db['karaneh'][$existingIdx]['id'] : genId('k'),
                'personnelId' => $mp ? ($mp['id'] ?? '') : '',
                'personnelCode' => $code,
                'fullName' => $row['fullName'] ?? $row['نام و نام خانوادگی'] ?? $row['نام'] ?? ($mp ? $mp['fullName'] : 'پرسنل'),
                'department' => $row['department'] ?? $row['واحد اداری'] ?? $row['واحد سازمانی'] ?? $row['واحد'] ?? ($mp ? $mp['department'] : 'عمومی'),
                'position' => $row['position'] ?? $row['پست سازمانی'] ?? $row['پست و سمت'] ?? $row['پست'] ?? $row['سمت'] ?? ($mp ? $mp['position'] : ''),
                'period' => $period,
                'baseKaraneh' => $base,
                'overtimeBonus' => $bonus,
                'deductions' => $ded,
                'finalKaraneh' => $final,
                'notes' => $row['notes'] ?? $row['توضیحات'] ?? $row['یادداشت'] ?? '',
                'updatedAt' => date('Y/m/d'),
            ];
            if ($existingIdx >= 0) $db['karaneh'][$existingIdx] = $rec;
            else $db['karaneh'][] = $rec;
            $count++;
        }
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'message' => "کارانه دوره با موفقیت بارگذاری شد ({$count} رکورد ثبت و محاسبه گردید)."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/karaneh/batch-delete') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'karaneh', 'delete');
        $ids = $body['ids'] ?? [];
        if (!is_array($ids) || count($ids) === 0) return ['status' => 400, 'body' => ['success' => false, 'message' => 'موردی برای حذف انتخاب نشده است.']];
        $idMap = array_flip(array_map('strval', $ids));
        $before = count($db['karaneh']);
        $db['karaneh'] = array_values(array_filter($db['karaneh'], fn($k) => !isset($idMap[(string)($k['id'] ?? '')])));
        $deletedCount = $before - count($db['karaneh']);
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => "{$deletedCount} رکورد کارانه با موفقیت حذف شد."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/karaneh/delete-all') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'karaneh', 'deleteAll');
        createSafetySnapshot('pre_delete_all_karaneh');
        $period = (string)($body['period'] ?? '');
        $before = count($db['karaneh']);
        $db['karaneh'] = $period !== '' ? array_values(array_filter($db['karaneh'], fn($k) => ($k['period'] ?? '') !== $period)) : [];
        $deletedCount = $before - count($db['karaneh']);
        saveDatabase($db);
        $msg = $period !== '' ? "تمام رکوردهای کارانه دوره {$period} ({$deletedCount} رکورد) حذف شدند." : "کل جدول کارانه ({$deletedCount} رکورد) پاکسازی شد.";
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => $msg]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'DELETE' && preg_match('#^/karaneh/([^/]+)$#', $path, $m)) {
    $id = urldecode($m[1]);
    $result = withDbLock(function () use ($id, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'karaneh', 'delete');
        $db['karaneh'] = array_values(array_filter($db['karaneh'], fn($k) => ($k['id'] ?? '') !== $id));
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'message' => 'رکورد کارانه با موفقیت حذف گردید.']];
    });
    jsonResponse($result['body'], $result['status']);
}

// 5. Job Groups
if ($method === 'GET' && $path === '/job-groups') {
    $db = loadDatabase();
    $authUser = requireAuthUser($db, $SERVER_SECRET);
    if (!checkPermission($authUser, 'jobGroups', 'view')) jsonResponse(['success' => true, 'data' => []]);
    jsonResponse(['success' => true, 'data' => $db['jobGroups']]);
}

if ($method === 'POST' && $path === '/job-groups') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'jobGroups', 'create');
        if (empty($body['code']) || empty($body['title'])) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'کد گروه و عنوان شغلی الزامی است.']];
        }
        $newGroup = array_merge($body, [
            'id' => 'jg-' . (int)round(microtime(true) * 1000),
            'grade' => (int)($body['grade'] ?? 1),
            'minBaseSalary' => (float)($body['minBaseSalary'] ?? 0),
            'maxBaseSalary' => (float)($body['maxBaseSalary'] ?? 0),
            'maxKaranehCeiling' => (float)($body['maxKaranehCeiling'] ?? 0),
            'requiredExperienceYears' => (int)($body['requiredExperienceYears'] ?? 0),
        ]);
        $db['jobGroups'][] = $newGroup;
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'data' => $newGroup, 'message' => 'گروه شغلی جدید ایجاد شد.']];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/job-groups/batch-delete') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'jobGroups', 'delete');
        $ids = $body['ids'] ?? [];
        if (!is_array($ids) || count($ids) === 0) return ['status' => 400, 'body' => ['success' => false, 'message' => 'موردی برای حذف انتخاب نشده است.']];
        $idMap = array_flip(array_map('strval', $ids));
        $before = count($db['jobGroups']);
        $db['jobGroups'] = array_values(array_filter($db['jobGroups'], fn($g) => !isset($idMap[(string)($g['id'] ?? '')])));
        $deletedCount = $before - count($db['jobGroups']);
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => "{$deletedCount} گروه شغلی با موفقیت حذف شد."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/job-groups/delete-all') {
    $result = withDbLock(function () use ($SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'jobGroups', 'deleteAll');
        createSafetySnapshot('pre_delete_all_job_groups');
        $deletedCount = count($db['jobGroups']);
        $db['jobGroups'] = [];
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => "کل جدول گروه‌های شغلی ({$deletedCount} رکورد) پاکسازی شد."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if (preg_match('#^/job-groups/([^/]+)$#', $path, $m)) {
    $id = urldecode($m[1]);
    if ($method === 'PUT') {
        $body = getJsonBody();
        $result = withDbLock(function () use ($id, $body, $SERVER_SECRET) {
            $db = loadDatabase();
            $authUser = requireAuthUser($db, $SERVER_SECRET);
            requirePerm($authUser, 'jobGroups', 'edit');
            foreach ($db['jobGroups'] as $i => $g) {
                if (($g['id'] ?? '') === $id) {
                    $db['jobGroups'][$i] = array_merge($g, $body);
                    saveDatabase($db);
                    return ['status' => 200, 'body' => ['success' => true, 'data' => $db['jobGroups'][$i], 'message' => 'گروه شغلی با موفقیت ویرایش شد.']];
                }
            }
            return ['status' => 404, 'body' => ['success' => false, 'message' => 'گروه شغلی یافت نشد.']];
        });
        jsonResponse($result['body'], $result['status']);
    }
    if ($method === 'DELETE') {
        $result = withDbLock(function () use ($id, $SERVER_SECRET) {
            $db = loadDatabase();
            $authUser = requireAuthUser($db, $SERVER_SECRET);
            requirePerm($authUser, 'jobGroups', 'delete');
            $db['jobGroups'] = array_values(array_filter($db['jobGroups'], fn($g) => ($g['id'] ?? '') !== $id));
            saveDatabase($db);
            return ['status' => 200, 'body' => ['success' => true, 'message' => 'گروه شغلی حذف شد.']];
        });
        jsonResponse($result['body'], $result['status']);
    }
}

// 5b. Job Classifications
if ($method === 'GET' && $path === '/job-classifications') {
    $db = loadDatabase();
    $authUser = requireAuthUser($db, $SERVER_SECRET);
    if (!checkPermission($authUser, 'jobGroups', 'view')) jsonResponse(['success' => true, 'data' => []]);
    jsonResponse(['success' => true, 'data' => $db['jobClassifications']]);
}

if ($method === 'POST' && $path === '/job-classifications') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'jobGroups', 'create');
        if (empty($body['personnelCode'])) return ['status' => 400, 'body' => ['success' => false, 'message' => 'کد پرسنلی الزامی است.']];
        $rec = [
            'id' => 'jc-' . (int)round(microtime(true) * 1000),
            'personnelCode' => trim((string)$body['personnelCode']),
            'firstName' => (string)($body['firstName'] ?? ''),
            'lastName' => (string)($body['lastName'] ?? ''),
            'workLocation' => (string)($body['workLocation'] ?? ''),
            'department' => (string)($body['department'] ?? ''),
            'nationalId' => (string)($body['nationalId'] ?? ''),
            'education' => (string)($body['education'] ?? ''),
            'hireDate' => (string)($body['hireDate'] ?? ''),
            'hireMonth' => (string)($body['hireMonth'] ?? ''),
            'miningExperienceDays' => (string)($body['miningExperienceDays'] ?? ''),
            'totalInsuranceHistory' => (string)($body['totalInsuranceHistory'] ?? ''),
            'miningExperience' => (string)($body['miningExperience'] ?? ''),
            'nonMiningExperience' => (string)($body['nonMiningExperience'] ?? ''),
            'jobGroup' => (string)($body['jobGroup'] ?? ''),
            'groupGapFrom1405' => (string)($body['groupGapFrom1405'] ?? ''),
            'nextGroupGap' => (string)($body['nextGroupGap'] ?? ''),
            'jobTitle' => (string)($body['jobTitle'] ?? ''),
            'position' => (string)($body['position'] ?? ''),
            'updatedAt' => date('Y/m/d'),
        ];
        $db['jobClassifications'][] = $rec;
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'data' => $rec, 'message' => 'رکورد طبقه‌بندی شغلی با موفقیت ثبت شد.']];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/job-classifications/batch-import') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'jobGroups', 'importExcel');
        $items = $body['items'] ?? [];
        if (!is_array($items) || count($items) === 0) return ['status' => 400, 'body' => ['success' => false, 'message' => 'فایل اکسل طبقه‌بندی خالی است.']];
        $added = 0; $updated = 0;
        foreach ($items as $row) {
            $code = trim((string)($row['personnelCode'] ?? $row['کد پرسنلی'] ?? ''));
            if ($code === '') continue;
            $mapped = [
                'personnelCode' => $code,
                'firstName' => (string)($row['firstName'] ?? $row['نام'] ?? ''),
                'lastName' => (string)($row['lastName'] ?? $row['نام خانوادگی'] ?? ''),
                'workLocation' => (string)($row['workLocation'] ?? $row['محل خدمت'] ?? ''),
                'department' => (string)($row['department'] ?? $row['واحد'] ?? $row['واحد سازمانی'] ?? ''),
                'nationalId' => (string)($row['nationalId'] ?? $row['کد ملی'] ?? ''),
                'education' => (string)($row['education'] ?? $row['مدرک تحصیلی'] ?? $row['تحصیلات'] ?? ''),
                'hireDate' => (string)($row['hireDate'] ?? $row['تاریخ استخدام'] ?? ''),
                'hireMonth' => (string)($row['hireMonth'] ?? $row['ماه استخدام'] ?? ''),
                'miningExperienceDays' => (string)($row['miningExperienceDays'] ?? $row['سابقه معدنی به روز'] ?? $row['سابقه معدنی به‌روز'] ?? ''),
                'totalInsuranceHistory' => (string)($row['totalInsuranceHistory'] ?? $row['سابقه بیمه کلی'] ?? ''),
                'miningExperience' => (string)($row['miningExperience'] ?? $row['سابقه معدنی'] ?? ''),
                'nonMiningExperience' => (string)($row['nonMiningExperience'] ?? $row['سابقه غیرمعدنی'] ?? $row['سابقه غیر معدنی'] ?? ''),
                'jobGroup' => (string)($row['jobGroup'] ?? $row['گروه شغلی'] ?? ''),
                'groupGapFrom1405' => (string)($row['groupGapFrom1405'] ?? $row['فاصله گروه از 1405 به بعد'] ?? $row['فاصله گروه از ۱۴۰۵ به بعد'] ?? ''),
                'nextGroupGap' => (string)($row['nextGroupGap'] ?? $row['فاصله گروه بعدی'] ?? ''),
                'jobTitle' => (string)($row['jobTitle'] ?? $row['شغل'] ?? ''),
                'position' => (string)($row['position'] ?? $row['پست'] ?? $row['پست سازمانی'] ?? ''),
                'updatedAt' => date('Y/m/d'),
            ];
            $idx = -1;
            foreach ($db['jobClassifications'] as $i => $item) {
                if (trim((string)($item['personnelCode'] ?? '')) === $code) { $idx = $i; break; }
            }
            if ($idx >= 0) {
                $db['jobClassifications'][$idx] = array_merge($db['jobClassifications'][$idx], $mapped);
                $updated++;
            } else {
                $db['jobClassifications'][] = array_merge(['id' => genId('jc')], $mapped);
                $added++;
            }
        }
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'message' => "جدول طبقه‌بندی با موفقیت بارگذاری شد ({$added} رکورد جدید و {$updated} رکورد به‌روزرسانی گردید)."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/job-classifications/batch-delete') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'jobGroups', 'delete');
        $ids = $body['ids'] ?? [];
        if (!is_array($ids) || count($ids) === 0) return ['status' => 400, 'body' => ['success' => false, 'message' => 'موردی برای حذف انتخاب نشده است.']];
        $idMap = array_flip(array_map('strval', $ids));
        $before = count($db['jobClassifications']);
        $db['jobClassifications'] = array_values(array_filter($db['jobClassifications'], fn($c) => !isset($idMap[(string)($c['id'] ?? '')])));
        $deletedCount = $before - count($db['jobClassifications']);
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => "{$deletedCount} ردیف طبقه‌بندی شغلی با موفقیت حذف شد."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/job-classifications/delete-all') {
    $result = withDbLock(function () use ($SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'jobGroups', 'deleteAll');
        createSafetySnapshot('pre_delete_all_job_classifications');
        $deletedCount = count($db['jobClassifications']);
        $db['jobClassifications'] = [];
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => "کل جدول طبقه‌بندی مشاغل ۱۸ ستونی ({$deletedCount} رکورد) پاکسازی شد."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if (preg_match('#^/job-classifications/([^/]+)$#', $path, $m)) {
    $id = urldecode($m[1]);
    if ($method === 'PUT') {
        $body = getJsonBody();
        $result = withDbLock(function () use ($id, $body, $SERVER_SECRET) {
            $db = loadDatabase();
            $authUser = requireAuthUser($db, $SERVER_SECRET);
            requirePerm($authUser, 'jobGroups', 'edit');
            foreach ($db['jobClassifications'] as $i => $item) {
                if (($item['id'] ?? '') === $id) {
                    $db['jobClassifications'][$i] = array_merge($item, $body, ['updatedAt' => date('Y/m/d')]);
                    saveDatabase($db);
                    return ['status' => 200, 'body' => ['success' => true, 'data' => $db['jobClassifications'][$i], 'message' => 'رکورد طبقه‌بندی شغلی ویرایش شد.']];
                }
            }
            return ['status' => 404, 'body' => ['success' => false, 'message' => 'رکورد طبقه‌بندی یافت نشد.']];
        });
        jsonResponse($result['body'], $result['status']);
    }
    if ($method === 'DELETE') {
        $result = withDbLock(function () use ($id, $SERVER_SECRET) {
            $db = loadDatabase();
            $authUser = requireAuthUser($db, $SERVER_SECRET);
            requirePerm($authUser, 'jobGroups', 'delete');
            $db['jobClassifications'] = array_values(array_filter($db['jobClassifications'], fn($item) => ($item['id'] ?? '') !== $id));
            saveDatabase($db);
            return ['status' => 200, 'body' => ['success' => true, 'message' => 'رکورد طبقه‌بندی شغلی حذف شد.']];
        });
        jsonResponse($result['body'], $result['status']);
    }
}

// 6. Commitments
if ($method === 'GET' && $path === '/commitments') {
    $db = loadDatabase();
    $authUser = requireAuthUser($db, $SERVER_SECRET);
    if (!checkPermission($authUser, 'commitments', 'view')) jsonResponse(['success' => true, 'data' => []]);
    jsonResponse(['success' => true, 'data' => $db['commitments']]);
}

if ($method === 'POST' && $path === '/commitments') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'commitments', 'create');
        if (empty($body['personnelCode']) || empty($body['commitmentType'])) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'کد پرسنلی و نوع تعهد الزامی است.']];
        }
        $code = trim((string)$body['personnelCode']);
        $mp = null;
        foreach ($db['personnel'] as $p) {
            if (trim((string)($p['personnelCode'] ?? '')) === $code) { $mp = $p; break; }
        }
        $isArchived = !empty($body['isArchived']);
        $newC = array_merge($body, [
            'id' => 'cmt-' . (int)round(microtime(true) * 1000),
            'personnelId' => $mp ? ($mp['id'] ?? '') : ($body['personnelId'] ?? ''),
            'personnelName' => $mp ? ($mp['fullName'] ?? 'پرسنل') : ($body['personnelName'] ?? 'پرسنل'),
            'amount' => (float)($body['amount'] ?? 0),
            'previouslyTakenAmount' => (float)($body['previouslyTakenAmount'] ?? 0),
            'maxAllowedAmount' => (float)($body['maxAllowedAmount'] ?? 0),
            'isArchived' => $isArchived,
            'archivedAt' => $isArchived ? ($body['archivedAt'] ?? date('Y/m/d')) : null,
            'archiveCode' => $isArchived ? ($body['archiveCode'] ?? ('ARC-' . substr((string)time(), -5))) : null,
            'status' => $body['status'] ?? 'جاری و معتبر',
        ]);
        $db['commitments'][] = $newC;
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'data' => $newC, 'message' => 'تعهد پرسنلی جدید با موفقیت ثبت شد.']];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/commitments/batch-import') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'commitments', 'importExcel');
        $items = $body['items'] ?? [];
        if (!is_array($items) || count($items) === 0) return ['status' => 400, 'body' => ['success' => false, 'message' => 'لیست تعهدات جهت بارگذاری خالی است.']];
        $added = 0;
        foreach ($items as $row) {
            $code = trim((string)($row['personnelCode'] ?? $row['کد پرسنلی'] ?? ''));
            if ($code === '') continue;
            $mp = null;
            foreach ($db['personnel'] as $p) {
                if (trim((string)($p['personnelCode'] ?? '')) === $code) { $mp = $p; break; }
            }
            $archVal = trim((string)($row['بایگانی'] ?? $row['وضعیت بایگانی'] ?? ''));
            $isArchived = ($archVal === 'بله' || $archVal === 'بایگانی شده' || ($row['isArchived'] ?? false) === true);
            $db['commitments'][] = [
                'id' => genId('cmt'),
                'personnelId' => $mp ? ($mp['id'] ?? '') : '',
                'personnelCode' => $code,
                'personnelName' => $row['personnelName'] ?? $row['نام پرسنل'] ?? $row['نام و نام خانوادگی'] ?? ($mp ? $mp['fullName'] : 'پرسنل'),
                'commitmentType' => $row['commitmentType'] ?? $row['نوع تعهد یا تضمین'] ?? $row['نوع تعهد'] ?? 'تعهد حسابداری',
                'amount' => (float)($row['amount'] ?? $row['مبلغ تعهد فعلی (ریال)'] ?? $row['مبلغ تعهد (ریال)'] ?? $row['مبلغ'] ?? 0),
                'previouslyTakenAmount' => (float)($row['previouslyTakenAmount'] ?? $row['مبلغ قبلاً دریافت شده (ریال)'] ?? $row['مبلغ قبلا دریافت شده'] ?? 0),
                'maxAllowedAmount' => (float)($row['maxAllowedAmount'] ?? $row['سقف مجاز کل (ریال)'] ?? $row['سقف مجاز'] ?? 0),
                'startDate' => (string)($row['startDate'] ?? $row['تاریخ شروع'] ?? '1403/01/01'),
                'endDate' => (string)($row['endDate'] ?? $row['تاریخ سررسید'] ?? '1405/01/01'),
                'status' => $row['status'] ?? $row['وضعیت'] ?? 'جاری و معتبر',
                'isArchived' => $isArchived,
                'archivedAt' => $isArchived ? date('Y/m/d') : null,
                'archiveCode' => $isArchived ? ('ARC-' . substr((string)time(), -5)) : null,
                'guarantorName' => $row['guarantorName'] ?? $row['نام ضامن'] ?? '',
                'notes' => $row['notes'] ?? $row['توضیحات'] ?? '',
            ];
            $added++;
        }
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'message' => "{$added} فقره تعهد پرسنلی با موفقیت از اکسل ثبت گردید."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/commitments/batch-delete') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'commitments', 'delete');
        $ids = $body['ids'] ?? [];
        if (!is_array($ids) || count($ids) === 0) return ['status' => 400, 'body' => ['success' => false, 'message' => 'موردی برای حذف انتخاب نشده است.']];
        $idMap = array_flip(array_map('strval', $ids));
        $before = count($db['commitments']);
        $db['commitments'] = array_values(array_filter($db['commitments'], fn($c) => !isset($idMap[(string)($c['id'] ?? '')])));
        $deletedCount = $before - count($db['commitments']);
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => "{$deletedCount} سند تعهد پرسنلی با موفقیت حذف شد."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/commitments/delete-all') {
    $result = withDbLock(function () use ($SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'commitments', 'deleteAll');
        createSafetySnapshot('pre_delete_all_commitments');
        $deletedCount = count($db['commitments']);
        $db['commitments'] = [];
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => "کل جدول تعهدات پرسنلی ({$deletedCount} سند) پاکسازی شد."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if (preg_match('#^/commitments/([^/]+)$#', $path, $m)) {
    $id = urldecode($m[1]);
    if ($method === 'PUT') {
        $body = getJsonBody();
        $result = withDbLock(function () use ($id, $body, $SERVER_SECRET) {
            $db = loadDatabase();
            $authUser = requireAuthUser($db, $SERVER_SECRET);
            $idx = -1;
            foreach ($db['commitments'] as $i => $c) {
                if (($c['id'] ?? '') === $id) { $idx = $i; break; }
            }
            if ($idx < 0) return ['status' => 404, 'body' => ['success' => false, 'message' => 'تعهد پرسنلی یافت نشد.']];
            $keys = array_keys($body);
            $onlyArchive = count($keys) > 0 && count(array_diff($keys, ['isArchived', 'archivedAt', 'archiveCode'])) === 0;
            if ($onlyArchive) {
                if (!checkPermission($authUser, 'commitments', 'archive') && !checkPermission($authUser, 'commitments', 'edit')) {
                    return ['status' => 403, 'body' => ['success' => false, 'message' => 'شما مجوز بایگانی تعهدات را ندارید.']];
                }
            } else {
                requirePerm($authUser, 'commitments', 'edit');
            }
            $prev = $db['commitments'][$idx];
            $nextArchived = array_key_exists('isArchived', $body) ? (bool)$body['isArchived'] : !empty($prev['isArchived']);
            $updated = array_merge($prev, $body, [
                'amount' => array_key_exists('amount', $body) ? (float)$body['amount'] : ($prev['amount'] ?? 0),
                'previouslyTakenAmount' => array_key_exists('previouslyTakenAmount', $body) ? (float)$body['previouslyTakenAmount'] : ($prev['previouslyTakenAmount'] ?? 0),
                'maxAllowedAmount' => array_key_exists('maxAllowedAmount', $body) ? (float)$body['maxAllowedAmount'] : ($prev['maxAllowedAmount'] ?? 0),
                'isArchived' => $nextArchived,
                'archivedAt' => $nextArchived ? ($body['archivedAt'] ?? $prev['archivedAt'] ?? date('Y/m/d')) : null,
                'archiveCode' => $nextArchived ? ($body['archiveCode'] ?? $prev['archiveCode'] ?? ('ARC-' . substr((string)time(), -5))) : null,
            ]);
            $db['commitments'][$idx] = $updated;
            saveDatabase($db);
            return ['status' => 200, 'body' => ['success' => true, 'data' => $updated, 'message' => 'تعهد پرسنلی با موفقیت به‌روزرسانی شد.']];
        });
        jsonResponse($result['body'], $result['status']);
    }
    if ($method === 'DELETE') {
        $result = withDbLock(function () use ($id, $SERVER_SECRET) {
            $db = loadDatabase();
            $authUser = requireAuthUser($db, $SERVER_SECRET);
            requirePerm($authUser, 'commitments', 'delete');
            $db['commitments'] = array_values(array_filter($db['commitments'], fn($c) => ($c['id'] ?? '') !== $id));
            saveDatabase($db);
            return ['status' => 200, 'body' => ['success' => true, 'message' => 'سند تعهد پرسنلی حذف شد.']];
        });
        jsonResponse($result['body'], $result['status']);
    }
}

// 7. Payroll
if ($method === 'GET' && $path === '/payroll') {
    $db = loadDatabase();
    $authUser = requireAuthUser($db, $SERVER_SECRET);
    if (!checkPermission($authUser, 'payroll', 'view')) jsonResponse(['success' => true, 'data' => []]);
    $period = $_GET['period'] ?? '';
    $records = $db['payroll'];
    if ($period !== '') {
        $records = array_values(array_filter($records, fn($r) => ($r['period'] ?? '') === $period));
    }
    jsonResponse(['success' => true, 'data' => $records]);
}

if ($method === 'POST' && $path === '/payroll/batch-import') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'payroll', 'importExcel');
        $period = (string)($body['period'] ?? '');
        $useRowYm = !empty($body['useRowYearMonth']);
        $items = $body['items'] ?? [];
        if ($period === '' || !is_array($items) || count($items) === 0) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'دوره و لیست ردیف‌های حقوق الزامی است.']];
        }
        $added = 0; $updated = 0;
        foreach ($items as $row) {
            if (!is_array($row)) continue;
            $code = trim((string)(getPayrollVal($row, 'كد پرسنلي', 'کد پرسنلی', 'personnelCode') ?? ''));
            if ($code === '') continue;
            $rawYm = getPayrollVal($row, 'سال/ماه', 'yearMonthLabel');
            $targetPeriod = $useRowYm ? parseYearMonthPhp($rawYm, $period) : $period;
            $firstName = trim((string)(getPayrollVal($row, 'نام', 'firstName') ?? ''));
            $lastName = trim((string)(getPayrollVal($row, 'نام خانوادگي', 'نام خانوادگی', 'lastName') ?? ''));
            $fullNameRaw = trim((string)(getPayrollVal($row, 'نام و نام خانوادگي', 'نام و نام خانوادگی', 'fullName') ?? ''));
            $mp = null;
            foreach ($db['personnel'] as $p) {
                if (trim((string)($p['personnelCode'] ?? '')) === $code) { $mp = $p; break; }
            }
            $fullName = $fullNameRaw !== '' ? $fullNameRaw : (trim($firstName . ' ' . $lastName) ?: ($mp ? $mp['fullName'] : 'پرسنل'));
            $rec = [
                'period' => $targetPeriod,
                'yearMonthLabel' => (string)($rawYm ?? str_replace('-', '/', $targetPeriod)),
                'employeeId' => (string)(getPayrollVal($row, 'شناسه كارمند', 'شناسه کارمند', 'employeeId') ?? ''),
                'personnelCode' => $code,
                'firstName' => $firstName,
                'lastName' => $lastName,
                'fullName' => $fullName,
                'nationalId' => (string)(getPayrollVal($row, 'كد ملي', 'کد ملی', 'nationalId') ?? ($mp['nationalId'] ?? '')),
                'workLocation' => (string)(getPayrollVal($row, 'محل خدمت', 'workLocation') ?? ''),
                'department' => (string)(getPayrollVal($row, 'واحد سازماني', 'واحد سازمانی', 'واحد', 'department') ?? ($mp['department'] ?? '')),
                'jobTitle' => (string)(getPayrollVal($row, 'شغل', 'jobTitle') ?? ''),
                'position' => (string)(getPayrollVal($row, 'پست', 'پست سازمانی', 'position') ?? ($mp['position'] ?? '')),
                'jobGroupCode' => (string)(getPayrollVal($row, 'کد گروه شغلي', 'کد گروه شغلی', 'jobGroupCode') ?? ''),
                'jobGroupTitle' => (string)(getPayrollVal($row, 'عنوان گروه شغلي', 'عنوان گروه شغلی', 'jobGroupTitle') ?? ''),
                'employmentType' => (string)(getPayrollVal($row, 'نوع استخدام', 'employmentType') ?? ''),
                'effectiveDays' => parseNumPayroll(getPayrollVal($row, 'کارکرد موثر', 'effectiveDays')),
                'netPayable' => parseNumPayroll(getPayrollVal($row, 'خالص پرداختی', 'netPayable')),
                'totalBenefits' => parseNumPayroll(getPayrollVal($row, 'جمع مزایا', 'totalBenefits')),
                'overtimeAmount' => parseNumPayroll(getPayrollVal($row, 'اضافه کاری', 'overtimeAmount')),
                'fridayWorkAmount' => parseNumPayroll(getPayrollVal($row, 'جمعه کاری', 'fridayWorkAmount')),
                'missionAmount' => parseNumPayroll(getPayrollVal($row, 'ماموریت ریالی', 'missionAmount')),
                'bonusAmount' => parseNumPayroll(getPayrollVal($row, 'پاداش', 'پاداشِ', 'bonusAmount')),
                'incentiveAmount' => parseNumPayroll(getPayrollVal($row, 'تشویقی', 'incentiveAmount')),
                'otherBenefits' => parseNumPayroll(getPayrollVal($row, 'سایر مزایا', 'otherBenefits')),
                'arrearsAmount' => parseNumPayroll(getPayrollVal($row, 'مابه التفاوت', 'arrearsAmount')),
                'advanceAmount' => parseNumPayroll(getPayrollVal($row, 'مساعده', 'advanceAmount')),
                'totalDeductions' => parseNumPayroll(getPayrollVal($row, 'جمع کسور', 'totalDeductions')),
                'taxAmount' => parseNumPayroll(getPayrollVal($row, 'مالیات', 'taxAmount')),
                'salaryTaxAmount' => parseNumPayroll(getPayrollVal($row, 'مالیات حقوق', 'salaryTaxAmount')),
                'jobWage' => parseNumPayroll(getPayrollVal($row, 'مزد شغل', 'jobWage')),
                'totalOrderFactors' => parseNumPayroll(getPayrollVal($row, 'جمع عوامل حکمی', 'جمع عوامل حكمي', 'totalOrderFactors')),
                'baseSalaryOrder' => parseNumPayroll(getPayrollVal($row, 'حقوق پایه(حكم-اصلي)', 'حقوق پایه(حکم-اصلی)', 'baseSalaryOrder')),
                'overtimeHours' => parseNumPayroll(getPayrollVal($row, 'ساعت اضافه کاری(کارکرد)', 'overtimeHours')),
                'fridayWorkHours' => parseNumPayroll(getPayrollVal($row, 'ساعت جمعه کاری(کارکرد)', 'fridayWorkHours')),
                'costCenterCode' => (string)(getPayrollVal($row, 'مرکز هزینه(كد تفصيل)', 'مرکز هزینه(کد تفصیل)') ?? ''),
                'costCenterTitle' => (string)(getPayrollVal($row, 'مرکز هزینه(عنوان تفصيل)', 'مرکز هزینه(عنوان تفصیل)') ?? ''),
                'projectCode' => (string)(getPayrollVal($row, 'پروژه(كد تفصيل)', 'پروژه(کد تفصیل)') ?? ''),
                'projectTitle' => (string)(getPayrollVal($row, 'پروژه(عنوان تفصيل)', 'پروژه(عنوان تفصیل)') ?? ''),
                'bankName' => (string)(getPayrollVal($row, 'نام بانک') ?? ''),
                'bankAccount' => (string)(getPayrollVal($row, 'شماره حساب') ?? ''),
                'rawFields' => $row,
                'updatedAt' => date('Y/m/d'),
            ];
            $existingIdx = -1;
            foreach ($db['payroll'] as $i => $r) {
                if (trim((string)($r['personnelCode'] ?? '')) === $code && ($r['period'] ?? '') === $targetPeriod) {
                    $existingIdx = $i;
                    break;
                }
            }
            if ($existingIdx >= 0) {
                $db['payroll'][$existingIdx] = array_merge($db['payroll'][$existingIdx], $rec);
                $updated++;
            } else {
                $db['payroll'][] = array_merge(['id' => genId('pay')], $rec);
                $added++;
            }
        }
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'message' => "فایل حقوق با موفقیت در دیتابیس ذخیره شد ({$added} رکورد جدید، {$updated} رکورد به‌روزرسانی گردید)."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/payroll/batch-delete') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'payroll', 'delete');
        $ids = $body['ids'] ?? [];
        if (!is_array($ids) || count($ids) === 0) return ['status' => 400, 'body' => ['success' => false, 'message' => 'موردی برای حذف انتخاب نشده است.']];
        $idMap = array_flip(array_map('strval', $ids));
        $before = count($db['payroll']);
        $db['payroll'] = array_values(array_filter($db['payroll'], fn($r) => !isset($idMap[(string)($r['id'] ?? '')])));
        $deletedCount = $before - count($db['payroll']);
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => "{$deletedCount} رکورد حقوقی با موفقیت حذف شد."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/payroll/delete-all') {
    $result = withDbLock(function () use ($SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'payroll', 'deleteAll');
        createSafetySnapshot('pre_delete_all_payroll');
        $deletedCount = count($db['payroll']);
        $db['payroll'] = [];
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => "کل جدول حقوق و دستمزد ({$deletedCount} فیش) با موفقیت پاکسازی شد."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'DELETE' && preg_match('#^/payroll/by-period/([^/]+)$#', $path, $m)) {
    $period = urldecode($m[1]);
    $result = withDbLock(function () use ($period, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'payroll', 'delete');
        $db['payroll'] = array_values(array_filter($db['payroll'], fn($r) => ($r['period'] ?? '') !== $period));
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'message' => "تمام رکوردهای حقوق دوره {$period} حذف شدند."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'DELETE' && preg_match('#^/payroll/([^/]+)$#', $path, $m)) {
    $id = urldecode($m[1]);
    $result = withDbLock(function () use ($id, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'payroll', 'delete');
        $db['payroll'] = array_values(array_filter($db['payroll'], fn($r) => ($r['id'] ?? '') !== $id));
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'message' => 'رکورد حقوق حذف گردید.']];
    });
    jsonResponse($result['body'], $result['status']);
}

// 7B. Mining Volumes, Fleet Machinery Workshop Status & Per-Unit Operational Reports
if ($method === 'GET' && $path === '/mining-volumes') {
    $db = loadDatabase();
    $authUser = requireAuthUser($db, $SERVER_SECRET);
    if (!hasMiningOrUnitPermPhp($authUser, 'view')) jsonResponse(['success' => true, 'data' => []]);
    $period = $_GET['period'] ?? '';
    $records = $db['miningVolumes'];
    if ($period !== '') {
        $records = array_values(array_filter($records, fn($v) => ($v['period'] ?? '') === $period));
    }
    if (!isSuperAdminUser($authUser) && !checkPermission($authUser, 'ceoDashboard', 'view')) {
        $records = array_values(array_filter($records, fn($v) => isDispatchingOrUnitAllowedPhp($authUser, $v['unitName'] ?? '')));
    }
    jsonResponse(['success' => true, 'data' => $records]);
}

if ($method === 'POST' && $path === '/mining-volumes') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        $action = !empty($body['id']) ? 'edit' : 'create';
        $hasCeo = checkPermission($authUser, 'ceoDashboard', $action);
        $hasUnit = checkPermission($authUser, 'unitOperations', $action) && isDispatchingOrUnitAllowedPhp($authUser, $body['unitName'] ?? '');
        if (!$hasCeo && !$hasUnit) return ['status' => 403, 'body' => ['success' => false, 'message' => 'عدم دسترسی ثبت یا ویرایش آمار حجم معدن.']];
        if (empty($body['period']) || empty($body['unitName'])) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'دوره و نام واحد عملیاتی الزامی است.']];
        }
        $vol = (float)($body['volumeValue'] ?? 0);
        $tgt = (float)($body['targetVolume'] ?? 0);
        $idx = -1;
        if (!empty($body['id'])) {
            foreach ($db['miningVolumes'] as $i => $v) { if (($v['id'] ?? '') === $body['id']) { $idx = $i; break; } }
        }
        $rec = [
            'id' => $idx >= 0 ? $db['miningVolumes'][$idx]['id'] : genId('mv'),
            'period' => trim((string)$body['period']),
            'unitName' => trim((string)$body['unitName']),
            'activityType' => trim((string)($body['activityType'] ?? 'عملیات معدنی')),
            'metricTitle' => trim((string)($body['metricTitle'] ?? $body['activityType'] ?? $body['unitName'])),
            'volumeValue' => is_finite($vol) ? $vol : 0,
            'targetVolume' => is_finite($tgt) ? $tgt : 0,
            'unitLabel' => trim((string)($body['unitLabel'] ?? 'تن')),
            'status' => trim((string)($body['status'] ?? ($tgt > 0 && $vol >= $tgt ? 'فراتر از برنامه' : 'در حال اجرا'))),
            'notes' => trim((string)($body['notes'] ?? '')),
            'updatedAt' => date('Y/m/d'),
        ];
        if ($idx >= 0) $db['miningVolumes'][$idx] = $rec; else $db['miningVolumes'][] = $rec;
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'data' => $rec, 'message' => 'آمار حجم عملیات ماهانه با موفقیت ذخیره شد.']];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/mining-volumes/batch-import') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        $canCeo = checkPermission($authUser, 'ceoDashboard', 'importExcel') || checkPermission($authUser, 'ceoDashboard', 'create');
        $canUnit = checkPermission($authUser, 'unitOperations', 'importExcel') || checkPermission($authUser, 'unitOperations', 'create');
        if (!$canCeo && !$canUnit) return ['status' => 403, 'body' => ['success' => false, 'message' => 'عدم دسترسی ورود اکسل آمار حجم عملیات.']];
        $items = $body['items'] ?? [];
        $added = 0; $updated = 0;
        foreach ($items as $row) {
            if (!is_array($row)) continue;
            $unitName = trim((string)(getPayrollVal($row, 'unitName', 'واحد عملیاتی معدن', 'واحد معدن', 'واحد') ?? ''));
            $period = parseYearMonthPhp(getPayrollVal($row, 'period', 'دوره (سال-ماه)', 'دوره', 'سال-ماه', 'سال/ماه'), '1403-08');
            if ($unitName === '') continue;
            if (!$canCeo && !isDispatchingOrUnitAllowedPhp($authUser, $unitName)) continue;
            $activityType = trim((string)(getPayrollVal($row, 'activityType', 'نوع عملیات / فعالیت', 'نوع عملیات', 'عملیات') ?? 'عملیات معدنی'));
            $metricTitle = trim((string)(getPayrollVal($row, 'metricTitle', 'عنوان شاخص حجم', 'عنوان شاخص', 'شرح عملیات') ?? $activityType));
            $vol = parseNumPayroll(getPayrollVal($row, 'volumeValue', 'حجم محقق‌شده ماه', 'حجم محقق شده', 'حجم', 'مقدار'));
            $tgt = parseNumPayroll(getPayrollVal($row, 'targetVolume', 'برنامه / هدف ماه', 'برنامه ماه', 'هدف ماه', 'هدف'));
            $unitLabel = trim((string)(getPayrollVal($row, 'unitLabel', 'واحد اندازه‌گیری', 'واحد اندازه گیری', 'یکا') ?? 'تن'));
            $status = trim((string)(getPayrollVal($row, 'status', 'وضعیت تحقق', 'وضعیت') ?? ($tgt > 0 && $vol >= $tgt ? 'فراتر از برنامه' : 'در حال اجرا')));
            $notes = trim((string)(getPayrollVal($row, 'notes', 'توضیحات', 'یادداشت') ?? ''));
            $idx = -1;
            foreach ($db['miningVolumes'] as $i => $v) {
                if (($v['period'] ?? '') === $period && normPayrollKey((string)($v['unitName'] ?? '')) === normPayrollKey($unitName) && normPayrollKey((string)($v['metricTitle'] ?? '')) === normPayrollKey($metricTitle)) { $idx = $i; break; }
            }
            $rec = [
                'id' => $idx >= 0 ? $db['miningVolumes'][$idx]['id'] : genId('mv'),
                'period' => $period, 'unitName' => $unitName, 'activityType' => $activityType, 'metricTitle' => $metricTitle,
                'volumeValue' => $vol, 'targetVolume' => $tgt, 'unitLabel' => $unitLabel, 'status' => $status, 'notes' => $notes, 'updatedAt' => date('Y/m/d'),
            ];
            if ($idx >= 0) { $db['miningVolumes'][$idx] = $rec; $updated++; } else { $db['miningVolumes'][] = $rec; $added++; }
        }
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'message' => "آمار حجم عملیات وارد شد ({$added} جدید، {$updated} به‌روزرسانی)."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/mining-volumes/batch-delete') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        if (!hasMiningOrUnitPermPhp($authUser, 'delete')) return ['status' => 403, 'body' => ['success' => false, 'message' => 'عدم دسترسی حذف.']];
        $ids = $body['ids'] ?? [];
        $idMap = array_flip(array_map('strval', $ids));
        $canAll = isSuperAdminUser($authUser) || checkPermission($authUser, 'ceoDashboard', 'delete');
        $before = count($db['miningVolumes']);
        $db['miningVolumes'] = array_values(array_filter($db['miningVolumes'], fn($v) => !isset($idMap[(string)($v['id'] ?? '')]) || (!$canAll && !isDispatchingOrUnitAllowedPhp($authUser, $v['unitName'] ?? ''))));
        $deletedCount = $before - count($db['miningVolumes']);
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => "{$deletedCount} ردیف آمار حجم حذف شد."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/mining-volumes/delete-all') {
    $result = withDbLock(function () use ($SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        if (!hasMiningOrUnitPermPhp($authUser, 'deleteAll')) return ['status' => 403, 'body' => ['success' => false, 'message' => 'عدم دسترسی پاکسازی.']];
        createSafetySnapshot('pre_delete_all_mining_volumes');
        $canAll = isSuperAdminUser($authUser) || checkPermission($authUser, 'ceoDashboard', 'deleteAll');
        $before = count($db['miningVolumes']);
        $db['miningVolumes'] = $canAll ? [] : array_values(array_filter($db['miningVolumes'], fn($v) => !isDispatchingOrUnitAllowedPhp($authUser, $v['unitName'] ?? '')));
        $deletedCount = $before - count($db['miningVolumes']);
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => "جدول آمار حجم عملیات ({$deletedCount} ردیف) پاکسازی شد."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'DELETE' && preg_match('#^/mining-volumes/([^/]+)$#', $path, $m)) {
    $id = urldecode($m[1]);
    $result = withDbLock(function () use ($id, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        if (!hasMiningOrUnitPermPhp($authUser, 'delete')) return ['status' => 403, 'body' => ['success' => false, 'message' => 'عدم دسترسی حذف.']];
        $db['miningVolumes'] = array_values(array_filter($db['miningVolumes'], fn($v) => ($v['id'] ?? '') !== $id || (!checkPermission($authUser, 'ceoDashboard', 'delete') && !isDispatchingOrUnitAllowedPhp($authUser, $v['unitName'] ?? ''))));
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'message' => 'ردیف آمار حجم حذف شد.']];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'GET' && $path === '/mining-machinery') {
    $db = loadDatabase();
    $authUser = requireAuthUser($db, $SERVER_SECRET);
    if (!hasMiningOrUnitPermPhp($authUser, 'view')) jsonResponse(['success' => true, 'data' => []]);
    $records = $db['miningMachinery'];
    if (!isSuperAdminUser($authUser) && !checkPermission($authUser, 'ceoDashboard', 'view')) {
        $records = array_values(array_filter($records, fn($m) => isWorkshopOrUnitAllowedPhp($authUser, $m['unitName'] ?? '')));
    }
    jsonResponse(['success' => true, 'data' => $records]);
}

if ($method === 'POST' && $path === '/mining-machinery') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        $action = !empty($body['id']) ? 'edit' : 'create';
        $hasCeo = checkPermission($authUser, 'ceoDashboard', $action);
        $hasUnit = checkPermission($authUser, 'unitOperations', $action) && isWorkshopOrUnitAllowedPhp($authUser, $body['unitName'] ?? '');
        if (!$hasCeo && !$hasUnit) return ['status' => 403, 'body' => ['success' => false, 'message' => 'عدم دسترسی ثبت یا ویرایش ماشین‌آلات.']];
        if (empty($body['machineCode']) || empty($body['machineName'])) return ['status' => 400, 'body' => ['success' => false, 'message' => 'کد دستگاه و نام تجهیز الزامی است.']];
        $rawSt = trim((string)($body['status'] ?? 'آماده به کار'));
        $status = (containsStr($rawSt, 'خراب') || containsStr($rawSt, 'تعمیرگاه')) ? 'خراب / در تعمیرگاه' : (containsStr($rawSt, 'قطعه') ? 'در انتظار قطعه' : (containsStr($rawSt, 'سرویس') ? 'سرویس دوره‌ای' : 'آماده به کار'));
        $idx = -1;
        foreach ($db['miningMachinery'] as $i => $m) {
            if (!empty($body['id']) ? (($m['id'] ?? '') === $body['id']) : (trim((string)($m['machineCode'] ?? '')) === trim((string)$body['machineCode']))) { $idx = $i; break; }
        }
        $rec = [
            'id' => $idx >= 0 ? $db['miningMachinery'][$idx]['id'] : genId('mm'),
            'machineCode' => trim((string)$body['machineCode']), 'machineName' => trim((string)$body['machineName']),
            'machineType' => trim((string)($body['machineType'] ?? 'تجهیز معدنی')), 'unitName' => trim((string)($body['unitName'] ?? 'استخراج و معدن‌کاری')),
            'status' => $status, 'issueDescription' => trim((string)($body['issueDescription'] ?? '')),
            'stoppedSince' => trim((string)($body['stoppedSince'] ?? '')), 'estimatedReadyDate' => trim((string)($body['estimatedReadyDate'] ?? '')),
            'operatorName' => trim((string)($body['operatorName'] ?? '')), 'notes' => trim((string)($body['notes'] ?? '')), 'updatedAt' => date('Y/m/d'),
        ];
        if ($idx >= 0) $db['miningMachinery'][$idx] = $rec; else $db['miningMachinery'][] = $rec;
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'data' => $rec, 'message' => 'وضعیت دستگاه و تعمیرگاه ذخیره شد.']];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/mining-machinery/batch-import') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        $canCeo = checkPermission($authUser, 'ceoDashboard', 'importExcel') || checkPermission($authUser, 'ceoDashboard', 'create');
        $canUnit = checkPermission($authUser, 'unitOperations', 'importExcel') || checkPermission($authUser, 'unitOperations', 'create');
        if (!$canCeo && !$canUnit) return ['status' => 403, 'body' => ['success' => false, 'message' => 'عدم دسترسی ورود اکسل ماشین‌آلات.']];
        $items = $body['items'] ?? [];
        $added = 0; $updated = 0;
        foreach ($items as $row) {
            if (!is_array($row)) continue;
            $code = trim((string)(getPayrollVal($row, 'machineCode', 'کد دستگاه / پلاک', 'کد دستگاه', 'کد تجهیز', 'پلاک تجهیز') ?? ''));
            $name = trim((string)(getPayrollVal($row, 'machineName', 'نام و مدل دستگاه', 'نام دستگاه', 'مدل دستگاه') ?? ''));
            if ($code === '' || $name === '') continue;
            $unitName = trim((string)(getPayrollVal($row, 'unitName', 'واحد مستقر / بهره‌بردار', 'واحد مستقر', 'واحد') ?? 'استخراج و معدن‌کاری'));
            if (!$canCeo && !isWorkshopOrUnitAllowedPhp($authUser, $unitName)) continue;
            $rawSt = trim((string)(getPayrollVal($row, 'status', 'وضعیت دستگاه', 'وضعیت') ?? 'آماده به کار'));
            $status = (containsStr($rawSt, 'خراب') || containsStr($rawSt, 'تعمیرگاه')) ? 'خراب / در تعمیرگاه' : (containsStr($rawSt, 'قطعه') ? 'در انتظار قطعه' : (containsStr($rawSt, 'سرویس') ? 'سرویس دوره‌ای' : 'آماده به کار'));
            $idx = -1;
            foreach ($db['miningMachinery'] as $i => $m) { if (trim((string)($m['machineCode'] ?? '')) === $code) { $idx = $i; break; } }
            $rec = [
                'id' => $idx >= 0 ? $db['miningMachinery'][$idx]['id'] : genId('mm'),
                'machineCode' => $code, 'machineName' => $name,
                'machineType' => trim((string)(getPayrollVal($row, 'machineType', 'نوع ماشین‌آلات', 'نوع دستگاه') ?? 'تجهیز معدنی')),
                'unitName' => $unitName, 'status' => $status,
                'issueDescription' => trim((string)(getPayrollVal($row, 'issueDescription', 'شرح خرابی / وضعیت تعمیر', 'شرح خرابی') ?? '')),
                'stoppedSince' => trim((string)(getPayrollVal($row, 'stoppedSince', 'تاریخ توقف / ورود به تعمیرگاه', 'تاریخ توقف') ?? '')),
                'estimatedReadyDate' => trim((string)(getPayrollVal($row, 'estimatedReadyDate', 'تاریخ تخمینی آماده‌به‌کار', 'تاریخ آماده به کار') ?? '')),
                'operatorName' => trim((string)(getPayrollVal($row, 'operatorName', 'اپراتور / مسئول تعمیر', 'اپراتور') ?? '')),
                'notes' => trim((string)(getPayrollVal($row, 'notes', 'یادداشت', 'توضیحات') ?? '')),
                'updatedAt' => date('Y/m/d'),
            ];
            if ($idx >= 0) { $db['miningMachinery'][$idx] = $rec; $updated++; } else { $db['miningMachinery'][] = $rec; $added++; }
        }
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'message' => "لیست ماشین‌آلات و تعمیرگاه وارد شد ({$added} جدید، {$updated} به‌روزرسانی)."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/mining-machinery/batch-delete') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        if (!hasMiningOrUnitPermPhp($authUser, 'delete')) return ['status' => 403, 'body' => ['success' => false, 'message' => 'عدم دسترسی حذف.']];
        $ids = $body['ids'] ?? [];
        $idMap = array_flip(array_map('strval', $ids));
        $canAll = isSuperAdminUser($authUser) || checkPermission($authUser, 'ceoDashboard', 'delete');
        $before = count($db['miningMachinery']);
        $db['miningMachinery'] = array_values(array_filter($db['miningMachinery'], fn($m) => !isset($idMap[(string)($m['id'] ?? '')]) || (!$canAll && !isWorkshopOrUnitAllowedPhp($authUser, $m['unitName'] ?? ''))));
        $deletedCount = $before - count($db['miningMachinery']);
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => "{$deletedCount} دستگاه حذف شد."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/mining-machinery/delete-all') {
    $result = withDbLock(function () use ($SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        if (!hasMiningOrUnitPermPhp($authUser, 'deleteAll')) return ['status' => 403, 'body' => ['success' => false, 'message' => 'عدم دسترسی پاکسازی.']];
        createSafetySnapshot('pre_delete_all_mining_machinery');
        $canAll = isSuperAdminUser($authUser) || checkPermission($authUser, 'ceoDashboard', 'deleteAll');
        $before = count($db['miningMachinery']);
        $db['miningMachinery'] = $canAll ? [] : array_values(array_filter($db['miningMachinery'], fn($m) => !isWorkshopOrUnitAllowedPhp($authUser, $m['unitName'] ?? '')));
        $deletedCount = $before - count($db['miningMachinery']);
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => "لیست ماشین‌آلات و تعمیرگاه ({$deletedCount} دستگاه) پاکسازی شد."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'DELETE' && preg_match('#^/mining-machinery/([^/]+)$#', $path, $m)) {
    $id = urldecode($m[1]);
    $result = withDbLock(function () use ($id, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        if (!hasMiningOrUnitPermPhp($authUser, 'delete')) return ['status' => 403, 'body' => ['success' => false, 'message' => 'عدم دسترسی حذف.']];
        $db['miningMachinery'] = array_values(array_filter($db['miningMachinery'], fn($x) => ($x['id'] ?? '') !== $id || (!checkPermission($authUser, 'ceoDashboard', 'delete') && !isWorkshopOrUnitAllowedPhp($authUser, $x['unitName'] ?? ''))));
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'message' => 'دستگاه از فهرست حذف شد.']];
    });
    jsonResponse($result['body'], $result['status']);
}

// 7C. Unit Operational Reports
if ($method === 'GET' && $path === '/unit-reports') {
    $db = loadDatabase();
    $authUser = requireAuthUser($db, $SERVER_SECRET);
    if (!hasMiningOrUnitPermPhp($authUser, 'view')) jsonResponse(['success' => true, 'data' => []]);
    $period = $_GET['period'] ?? '';
    $unitName = $_GET['unitName'] ?? '';
    $records = $db['unitReports'];
    if ($period !== '') $records = array_values(array_filter($records, fn($r) => ($r['period'] ?? '') === $period));
    if ($unitName !== '') $records = array_values(array_filter($records, fn($r) => normPayrollKey((string)($r['unitName'] ?? '')) === normPayrollKey((string)$unitName)));
    if (!isSuperAdminUser($authUser) && !checkPermission($authUser, 'ceoDashboard', 'view')) {
        $records = array_values(array_filter($records, fn($r) => isUnitAllowedPhp($authUser, $r['unitName'] ?? '')));
    }
    jsonResponse(['success' => true, 'data' => $records]);
}

if ($method === 'POST' && $path === '/unit-reports') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        $action = !empty($body['id']) ? 'edit' : 'create';
        $hasCeo = checkPermission($authUser, 'ceoDashboard', $action);
        $hasUnit = checkPermission($authUser, 'unitOperations', $action) && isUnitAllowedPhp($authUser, $body['unitName'] ?? '');
        if (!$hasCeo && !$hasUnit) return ['status' => 403, 'body' => ['success' => false, 'message' => 'عدم دسترسی ثبت یا ویرایش گزارش واحد.']];
        if (empty($body['period']) || empty($body['unitName']) || empty($body['metricName'])) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'دوره، نام واحد و عنوان شاخص الزامی است.']];
        }
        $idx = -1;
        if (!empty($body['id'])) {
            foreach ($db['unitReports'] as $i => $r) { if (($r['id'] ?? '') === $body['id']) { $idx = $i; break; } }
        }
        $rec = [
            'id' => $idx >= 0 ? $db['unitReports'][$idx]['id'] : genId('ur'),
            'period' => trim((string)$body['period']),
            'unitName' => trim((string)$body['unitName']),
            'reportCategory' => trim((string)($body['reportCategory'] ?? 'گزارش عملیاتی واحد')),
            'metricName' => trim((string)$body['metricName']),
            'actualValue' => (float)($body['actualValue'] ?? 0),
            'previousValue' => (float)($body['previousValue'] ?? 0),
            'targetValue' => (float)($body['targetValue'] ?? 0),
            'unitLabel' => trim((string)($body['unitLabel'] ?? 'عدد')),
            'status' => trim((string)($body['status'] ?? 'تایید شده')),
            'submittedBy' => trim((string)($body['submittedBy'] ?? ($authUser['fullName'] ?? ''))),
            'notes' => trim((string)($body['notes'] ?? '')),
            'rawFields' => (isset($body['rawFields']) && is_array($body['rawFields'])) ? array_slice($body['rawFields'], 0, 100, true) : [],
            'updatedAt' => date('Y/m/d'),
        ];
        if ($idx >= 0) $db['unitReports'][$idx] = $rec; else $db['unitReports'][] = $rec;
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'data' => $rec, 'message' => 'گزارش عملیاتی واحد با موفقیت ذخیره شد.']];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/unit-reports/batch-import') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        $canCeo = checkPermission($authUser, 'ceoDashboard', 'importExcel') || checkPermission($authUser, 'ceoDashboard', 'create');
        $canUnit = checkPermission($authUser, 'unitOperations', 'importExcel') || checkPermission($authUser, 'unitOperations', 'create');
        if (!$canCeo && !$canUnit) return ['status' => 403, 'body' => ['success' => false, 'message' => 'عدم دسترسی ورود اکسل گزارش واحدها.']];
        $items = $body['items'] ?? [];
        $defUnit = (string)($body['unitName'] ?? '');
        $defPeriod = (string)($body['period'] ?? '1403-08');
        $defCat = (string)($body['reportCategory'] ?? 'گزارش عملیاتی واحد');
        $added = 0; $updated = 0;
        foreach ($items as $row) {
            if (!is_array($row)) continue;
            $unitName = trim((string)(getPayrollVal($row, 'unitName', 'واحد عملیاتی معدن', 'نام واحد', 'واحد', 'بخش') ?? $defUnit));
            $period = parseYearMonthPhp(getPayrollVal($row, 'period', 'دوره (سال-ماه)', 'دوره', 'سال-ماه', 'سال/ماه') ?? $defPeriod, '1403-08');
            $metricName = trim((string)(getPayrollVal($row, 'metricName', 'عنوان شاخص / فعالیت', 'شرح شاخص', 'فعالیت', 'عنوان', 'موضوع') ?? ''));
            if ($unitName === '' || $metricName === '') continue;
            if (!$canCeo && !isUnitAllowedPhp($authUser, $unitName)) continue;
            $idx = -1;
            foreach ($db['unitReports'] as $i => $r) {
                if (($r['period'] ?? '') === $period && normPayrollKey((string)($r['unitName'] ?? '')) === normPayrollKey($unitName) && normPayrollKey((string)($r['metricName'] ?? '')) === normPayrollKey($metricName)) { $idx = $i; break; }
            }
            $rawFields = (isset($row['rawFields']) && is_array($row['rawFields'])) ? $row['rawFields'] : $row;
            $rec = [
                'id' => $idx >= 0 ? $db['unitReports'][$idx]['id'] : genId('ur'),
                'period' => $period, 'unitName' => $unitName,
                'reportCategory' => trim((string)(getPayrollVal($row, 'reportCategory', 'دسته‌بندی گزارش', 'نوع گزارش', 'گروه فعالیت') ?? $defCat)),
                'metricName' => $metricName,
                'actualValue' => parseNumPayroll(getPayrollVal($row, 'actualValue', 'مقدار محقق‌شده', 'عملکرد ماه جاری', 'عملکرد', 'مقدار', 'مقدار فعلی')),
                'previousValue' => parseNumPayroll(getPayrollVal($row, 'previousValue', 'مقدار ماه قبل', 'عملکرد ماه قبل', 'دوره قبل')),
                'targetValue' => parseNumPayroll(getPayrollVal($row, 'targetValue', 'هدف / برنامه', 'برنامه ماه', 'هدف')),
                'unitLabel' => trim((string)(getPayrollVal($row, 'unitLabel', 'واحد اندازه‌گیری', 'واحد اندازه گیری', 'یکا') ?? 'عدد')),
                'status' => trim((string)(getPayrollVal($row, 'status', 'وضعیت گزارش', 'وضعیت') ?? 'تایید شده')),
                'submittedBy' => trim((string)(getPayrollVal($row, 'submittedBy', 'ثبت‌کننده / مسئول واحد', 'مسئول واحد', 'ثبت‌کننده') ?? ($authUser['fullName'] ?? ''))),
                'notes' => trim((string)(getPayrollVal($row, 'notes', 'توضیحات / تحلیل واحد', 'توضیحات', 'یادداشت') ?? '')),
                'rawFields' => array_slice($rawFields, 0, 100, true),
                'updatedAt' => date('Y/m/d'),
            ];
            if ($idx >= 0) { $db['unitReports'][$idx] = $rec; $updated++; } else { $db['unitReports'][] = $rec; $added++; }
        }
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'message' => "گزارش اکسل واحدها با موفقیت ثبت شد ({$added} جدید، {$updated} به‌روزرسانی)."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/unit-reports/batch-delete') {
    $body = getJsonBody();
    $result = withDbLock(function () use ($body, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        if (!hasMiningOrUnitPermPhp($authUser, 'delete')) return ['status' => 403, 'body' => ['success' => false, 'message' => 'عدم دسترسی حذف.']];
        $ids = $body['ids'] ?? [];
        $idMap = array_flip(array_map('strval', $ids));
        $canAll = isSuperAdminUser($authUser) || checkPermission($authUser, 'ceoDashboard', 'delete');
        $before = count($db['unitReports']);
        $db['unitReports'] = array_values(array_filter($db['unitReports'], fn($r) => !isset($idMap[(string)($r['id'] ?? '')]) || (!$canAll && !isUnitAllowedPhp($authUser, $r['unitName'] ?? ''))));
        $deletedCount = $before - count($db['unitReports']);
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => "{$deletedCount} ردیف گزارش واحد حذف شد."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/unit-reports/delete-all') {
    $result = withDbLock(function () use ($SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        if (!hasMiningOrUnitPermPhp($authUser, 'deleteAll')) return ['status' => 403, 'body' => ['success' => false, 'message' => 'عدم دسترسی پاکسازی.']];
        createSafetySnapshot('pre_delete_all_unit_reports');
        $canAll = isSuperAdminUser($authUser) || checkPermission($authUser, 'ceoDashboard', 'deleteAll');
        $before = count($db['unitReports']);
        $db['unitReports'] = $canAll ? [] : array_values(array_filter($db['unitReports'], fn($r) => !isUnitAllowedPhp($authUser, $r['unitName'] ?? '')));
        $deletedCount = $before - count($db['unitReports']);
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'deletedCount' => $deletedCount, 'message' => "گزارش‌های واحدهای عملیاتی ({$deletedCount} ردیف) پاکسازی شد."]];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'DELETE' && preg_match('#^/unit-reports/([^/]+)$#', $path, $m)) {
    $id = urldecode($m[1]);
    $result = withDbLock(function () use ($id, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        if (!hasMiningOrUnitPermPhp($authUser, 'delete')) return ['status' => 403, 'body' => ['success' => false, 'message' => 'عدم دسترسی حذف.']];
        $db['unitReports'] = array_values(array_filter($db['unitReports'], fn($r) => ($r['id'] ?? '') !== $id || (!checkPermission($authUser, 'ceoDashboard', 'delete') && !isUnitAllowedPhp($authUser, $r['unitName'] ?? ''))));
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'message' => 'ردیف گزارش عملیاتی واحد حذف شد.']];
    });
    jsonResponse($result['body'], $result['status']);
}

// 8. Database status, backup, restore, reset
if ($method === 'GET' && $path === '/database/status') {
    $db = loadDatabase();
    $authUser = requireAuthUser($db, $SERVER_SECRET);
    $fileSize = file_exists(DB_FILE) ? (int)filesize(DB_FILE) : 0;
    $lastSaved = file_exists(DB_FILE) ? date('Y/m/d H:i', (int)filemtime(DB_FILE)) : 'ثبت نشده';
    $archived = count(array_filter($db['commitments'], fn($c) => !empty($c['isArchived'])));
    $activeUsers = count(array_filter($db['users'], fn($u) => !isset($u['isActive']) || !empty($u['isActive'])));
    $docsCount = count(array_filter($db['personnel'], function($p) {
        $d = $p['documents'] ?? [];
        return !empty($d['nationalCardImage']) || (!empty($d['shenasnamehPages']) && count($d['shenasnamehPages']) > 0);
    }));
    $payrollPeriodsCount = count(array_unique(array_filter(array_map(fn($p) => $p['period'] ?? '', $db['payroll']))));
    $karanehPeriodsCount = count(array_unique(array_filter(array_map(fn($k) => $k['period'] ?? '', $db['karaneh']))));
    $totalRelatives = 0;
    foreach ($db['personnel'] as $p) {
        if (!empty($p['relatives']) && is_array($p['relatives'])) {
            $totalRelatives += count($p['relatives']);
        }
    }
    jsonResponse([
        'success' => true,
        'data' => [
            'storageLocation' => 'پایگاه داده دائمی داخلی پوشه سایت (PHP Flat-File + Lock)',
            'totalPersonnel' => count($db['personnel']),
            'totalRelatives' => $totalRelatives,
            'totalKaranehRecords' => count($db['karaneh']),
            'totalPayrollRecords' => count($db['payroll']),
            'totalUsers' => count($db['users']),
            'totalActiveUsers' => $activeUsers,
            'totalPersonnelWithDocs' => $docsCount,
            'payrollPeriodsCount' => $payrollPeriodsCount,
            'karanehPeriodsCount' => $karanehPeriodsCount,
            'totalJobGroups' => count($db['jobGroups']),
            'totalJobClassifications' => count($db['jobClassifications']),
            'totalCommitments' => count($db['commitments']),
            'totalArchivedCommitments' => $archived,
            'totalMiningVolumes' => count($db['miningVolumes']),
            'totalMiningMachinery' => count($db['miningMachinery']),
            'totalUnitReports' => count($db['unitReports']),
            'storageEngine' => 'php-disk',
            'fileSizeBytes' => $fileSize,
            'lastSaved' => $lastSaved,
            'isLocalHost' => false,
            'hostPlatform' => 'php-folder',
            'authProtected' => true,
            'firebaseProjectId' => FIREBASE_PROJECT_ID,
            'firestoreDatabaseId' => FIREBASE_DB_ID,
            'schemaVersion' => '5.0-negin-parto-nasr-units-hub',
        ],
    ]);
}

if ($method === 'GET' && $path === '/database/export-snapshot') {
    $db = loadDatabase();
    $authUser = requireAuthUser($db, $SERVER_SECRET);
    if (!isSuperAdminUser($authUser) && !checkPermission($authUser, 'system', 'backupDatabase')) {
        jsonResponse(['success' => false, 'message' => 'شما مجوز دریافت اسنپ‌شات همگام‌سازی را ندارید.'], 403);
    }
    jsonResponse([
        'success' => true,
        'data' => [
            'users' => array_map('stripPassword', $db['users']),
            'personnel' => $db['personnel'],
            'karaneh' => $db['karaneh'],
            'jobGroups' => $db['jobGroups'],
            'jobClassifications' => $db['jobClassifications'],
            'commitments' => $db['commitments'],
            'payroll' => $db['payroll'],
            'miningVolumes' => $db['miningVolumes'],
            'miningMachinery' => $db['miningMachinery'],
            'unitReports' => $db['unitReports'],
        ],
    ]);
}

if ($method === 'POST' && $path === '/database/merge-firestore') {
    $incoming = getJsonBody();
    $result = withDbLock(function () use ($incoming, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'system', 'restoreDatabase');
        createSafetySnapshot('before_firestore_merge');
        $mergeById = function (array $existingArr, array $incomingArr): array {
            $map = [];
            foreach ($existingArr as $item) {
                if (!empty($item['id'])) $map[(string)$item['id']] = $item;
            }
            foreach ($incomingArr as $item) {
                if (empty($item['id'])) continue;
                $id = (string)$item['id'];
                $map[$id] = isset($map[$id]) ? array_merge($map[$id], $item) : $item;
            }
            return array_values($map);
        };
        foreach (['personnel', 'karaneh', 'jobGroups', 'jobClassifications', 'commitments', 'payroll', 'miningVolumes', 'miningMachinery', 'unitReports'] as $col) {
            if (!empty($incoming[$col]) && is_array($incoming[$col])) {
                $db[$col] = $mergeById($db[$col], $incoming[$col]);
            }
        }
        if (!empty($incoming['users']) && is_array($incoming['users'])) {
            $uMap = [];
            foreach ($db['users'] as $u) {
                if (!empty($u['id'])) $uMap[(string)$u['id']] = $u;
            }
            foreach ($incoming['users'] as $u) {
                if (empty($u['id']) || ($u['username'] ?? '') === 'javadabadiyan') continue;
                $uid = (string)$u['id'];
                if (isset($uMap[$uid])) {
                    $prevPass = $uMap[$uid]['password'] ?? '';
                    $uMap[$uid] = array_merge($uMap[$uid], $u);
                    $uMap[$uid]['password'] = $prevPass;
                } else {
                    $u['password'] = hashPasswordPhp('12345678');
                    $uMap[$uid] = $u;
                }
            }
            $db['users'] = array_values($uMap);
        }
        saveDatabase($db);
        return ['status' => 200, 'body' => ['success' => true, 'message' => 'اطلاعات ابری Firestore با موفقیت در پایگاه داده ادغام و ذخیره شد.']];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'GET' && $path === '/database/backup') {
    $db = loadDatabase();
    $authUser = requireAuthUser($db, $SERVER_SECRET);
    requirePerm($authUser, 'system', 'backupDatabase');
    $totalRelatives = 0;
    foreach ($db['personnel'] as $p) {
        if (!empty($p['relatives']) && is_array($p['relatives'])) {
            $totalRelatives += count($p['relatives']);
        }
    }
    $backupPayload = $db;
    $backupPayload['_backupMetadata'] = [
        'version' => '5.0-negin-parto-nasr-units-hub',
        'exportedAt' => gmdate('c'),
        'modules' => ['personnel', 'relatives', 'documents', 'karaneh', 'payroll', 'jobGroups', 'jobClassifications', 'commitments', 'users', 'smartDashboard', 'ceoDashboard', 'unitOperations', 'miningVolumes', 'miningMachinery', 'unitReports', 'smartExcel'],
        'counts' => [
            'users' => count($db['users']),
            'personnel' => count($db['personnel']),
            'relatives' => $totalRelatives,
            'karaneh' => count($db['karaneh']),
            'payroll' => count($db['payroll']),
            'jobGroups' => count($db['jobGroups']),
            'jobClassifications' => count($db['jobClassifications']),
            'commitments' => count($db['commitments']),
            'miningVolumes' => count($db['miningVolumes']),
            'miningMachinery' => count($db['miningMachinery']),
            'unitReports' => count($db['unitReports']),
        ],
    ];
    header('Content-Disposition: attachment; filename=hr_database_backup_' . time() . '.json');
    echo json_encode($backupPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

if ($method === 'POST' && $path === '/database/restore') {
    $backup = getJsonBody();
    $result = withDbLock(function () use ($backup, $SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'system', 'restoreDatabase');
        if (!isset($backup['users']) || !is_array($backup['users']) || !isset($backup['personnel']) || !is_array($backup['personnel'])) {
            return ['status' => 400, 'body' => ['success' => false, 'message' => 'ساختار فایل پشتیبان معتبر نیست.']];
        }
        unset($backup['_backupMetadata']);
        createSafetySnapshot('before_restore');
        foreach ($backup['users'] as $i => $u) {
            $pass = (string)($u['password'] ?? '');
            if ($pass !== '' && !startsWith($pass, '$2y$') && !startsWith($pass, '$2a$') && !startsWith($pass, '$argon2') && !startsWith($pass, 'scrypt$')) {
                $backup['users'][$i]['password'] = hashPasswordPhp($pass);
            }
        }
        saveDatabase(normalizeDbArrays($backup));
        return ['status' => 200, 'body' => ['success' => true, 'message' => 'پایگاه داده سیستم (تمامی ماژول‌ها، مجوزها و اسناد) با موفقیت بازیابی گردید.']];
    });
    jsonResponse($result['body'], $result['status']);
}

if ($method === 'POST' && $path === '/database/reset-demo') {
    $result = withDbLock(function () use ($SERVER_SECRET) {
        $db = loadDatabase();
        $authUser = requireAuthUser($db, $SERVER_SECRET);
        requirePerm($authUser, 'system', 'restoreDatabase');
        createSafetySnapshot('before_reset_demo');
        $initial = getInitialDatabase();
        saveDatabase($initial);
        return ['status' => 200, 'body' => ['success' => true, 'message' => 'داده‌های اولیه و دمو با موفقیت بازنشانی شدند (بکاپ خودکار از اطلاعات قبلی ذخیره شد).']];
    });
    jsonResponse($result['body'], $result['status']);
}

jsonResponse(['success' => false, 'message' => 'مسیر درخواستی یافت نشد.'], 404);
