# Тучка МТС — Облачная IaaS Платформа

## Полный технический отчёт

---

## 📋 Обзор проекта

**Тучка МТС** — это полнофункциональная облачная IaaS (Infrastructure as a Service) платформа, позволяющая пользователям создавать, управлять и мониторить виртуальные машины через веб-интерфейс. Платформа реализует мультитенантную архитектуру с системой квот, биллинга, мониторинга и администрирования.

---

## 🏗️ Архитектура системы

Проект построен на **микросервисной архитектуре** из трёх основных компонентов:

```
┌─────────────────┐     HTTP/WS      ┌──────────────────┐     gRPC      ┌──────────────────┐
│                 │ ◄──────────────► │                  │ ◄───────────► │                  │
│    Frontend     │                  │  Control Plane   │               │  Compute Node    │
│   (React/Vite)  │                  │   (FastAPI/Py)   │               │    (Go/gRPC)     │
│                 │                  │                  │               │                  │
└─────────────────┘                  └──────┬───────────┘               └──────┬───────────┘
                                            │                                  │
                                            ▼                                  ▼
                                    ┌──────────────┐                   ┌──────────────┐
                                    │  PostgreSQL   │                   │   Docker      │
                                    │   Database    │                   │   Engine      │
                                    └──────────────┘                   └──────────────┘
```

### 1. Frontend (React + Vite)
- **Технологии**: React 19, Vite 7, Tailwind CSS 3, Recharts, xterm.js
- **Расположение**: `frontend/`
- **Роль**: SPA-приложение с двумя основными дашбордами (пользовательский и админский)

### 2. Control Plane (Python FastAPI)
- **Технологии**: FastAPI, SQLAlchemy (async), PostgreSQL, JWT-аутентификация
- **Расположение**: `control-plane/`
- **Роль**: REST API сервер, бизнес-логика, управление пользователями, тенантами, квотами, биллингом

### 3. Compute Node (Go + gRPC)
- **Технологии**: Go, gRPC, Docker SDK
- **Расположение**: `compute-node/`
- **Роль**: Непосредственное управление Docker-контейнерами (создание, удаление, мониторинг, снапшоты)

### Инфраструктура
- **Docker Compose** (`docker-compose.yml`) — оркестрация всех сервисов
- **PostgreSQL** — основная база данных
- **Docker Engine** — среда выполнения виртуальных машин (контейнеры)
- **gRPC** (`proto/cloud.proto`) — протокол связи между Control Plane и Compute Node

---

## 🔑 Главные фичи

### 1. 🖥️ Управление виртуальными машинами

**Полный жизненный цикл ВМ:**
- **Создание** — пошаговый мастер с выбором vCPU (1-8), RAM (512MB-4GB), образа ОС (Ubuntu, Alpine, Debian, Nginx) и калькулятором стоимости в реальном времени
- **Запуск/Остановка** — мгновенное управление состоянием контейнера
- **Гибернация** — автоматический перевод неактивных ВМ в режим сна для экономии ресурсов
- **Удаление** — безопасное удаление с подтверждением
- **Импорт** — загрузка ВМ из .tar/.tar.gz файлов

**Поддерживаемые статусы:**
| Статус | Описание |
|--------|----------|
| PROVISIONING | ВМ создаётся |
| RUNNING | ВМ работает |
| STOPPED | ВМ остановлена |
| HIBERNATING | ВМ в режиме гибернации (💤) |
| FAILED | Ошибка создания |
| DELETING | ВМ удаляется |

**Файлы:**
- `control-plane/app/routers/instances.py` — REST API для управления ВМ
- `control-plane/app/services/instance.py` — бизнес-логика создания с проверкой квот
- `control-plane/app/grpc_client.py` — gRPC клиент для связи с Compute Node
- `compute-node/main.go` — Go сервер, управляющий Docker-контейнерами
- `frontend/src/components/CreateInstanceModal.jsx` — UI мастер создания ВМ

---

### 2. 💰 Система биллинга (поминутная оплата)

**Тарификация (BYN — белорусские рубли):**
| Ресурс | Стоимость |
|--------|-----------|
| vCPU | 0.0004 BYN/мин за ядро |
| RAM | 0.0002 BYN/мин за GB |
| SSD хранилище | 0.00001 BYN/мин за GB |

> **Пример:** ВМ с 1 vCPU, 1GB RAM, 10GB SSD ≈ **30 BYN/месяц**

**Особенности:**
- **Калькулятор при создании ВМ** — пользователь видит стоимость в реальном времени (₽/мин, ₽/час, ₽/день, ₽/месяц) при выборе конфигурации
- **Детализация по инстансам** — таблица с разбивкой стоимости каждой ВМ (₽/мин, ₽/час, время работы, итого)
- **Графики расходов** — 30-дневный график ежедневных затрат (Area Chart)
- **Реалистичные данные** — расчёт на основе реальных `created_at` дат инстансов с детерминированной вариацией (данные не меняются при обновлении страницы)
- **Гибернация экономит деньги** — в режиме гибернации оплачивается только хранилище, CPU и RAM не тарифицируются

**Админский биллинг:**
- Общий доход платформы за 30 дней
- Глобальная ставка (₽/час, ₽/день)
- Структура дохода (Pie Chart: vCPU / RAM / Storage)
- Топ тенантов по расходам

**Файлы:**
- `control-plane/app/routers/billing.py` — API биллинга (tenant + admin endpoints)
- `frontend/src/pages/Dashboard.jsx` — вкладка "Биллинг" для пользователей
- `frontend/src/pages/AdminDashboard.jsx` — вкладка "Биллинг" для админов

---

### 3. 🔐 Мультитенантная система с квотами

**Модель доступа:**
```
Admin → управляет всеми тенантами
  └── Tenant (организация)
        ├── Quota (лимиты: max_vcpu, max_ram_mb, max_instances)
        ├── Members (пользователи с ролями owner/member)
        └── Instances (виртуальные машины)
```

**Квоты:**
- Максимальное количество vCPU
- Максимальный объём RAM (MB)
- Максимальное количество инстансов
- Проверка квот с блокировкой на уровне строки БД (`SELECT ... FOR UPDATE`) для предотвращения race condition

**Система запросов доступа:**
1. Новый пользователь регистрируется
2. Отправляет запрос администратору с описанием
3. Администратор одобряет/отклоняет запрос, назначая тенант
4. Пользователь получает доступ к ресурсам

**Файлы:**
- `control-plane/app/models/base.py` — модели данных (User, Tenant, TenantMember, Quota, Instance, TenantRequest, Backup)
- `control-plane/app/routers/admin.py` — API администрирования
- `control-plane/app/routers/auth.py` — аутентификация (JWT)

---

### 4. 📊 Мониторинг в реальном времени

**Пользовательский мониторинг:**
- Pie Charts: использование инстансов, vCPU, RAM vs квоты
- Мониторинг отдельных ВМ (CPU%, RAM, Network I/O) через модальное окно

**Админский мониторинг:**
- Обзор кластера: общее количество тенантов, выделенные vCPU/RAM, состояние ноды
- Bar Chart: распределение ресурсов по тенантам
- Radar Chart: нагрузка физической ноды (CPU, RAM, Disk, Containers)
- Pie Chart: статусы всех инстансов
- Area Chart: нагрузка кластера в реальном времени (обновление каждые 5 сек)
- Heatmap: активность запуска ВМ за год (GitHub-style)

**Файлы:**
- `control-plane/app/routers/admin.py` — `/cluster/stats`, `/cluster/history`, `/activity/heatmap`
- `frontend/src/components/InstanceMonitoringModal.jsx` — мониторинг отдельной ВМ
- `frontend/src/pages/AdminDashboard.jsx` — вкладка "Обзор"

---

### 5. 🖥️ Веб-терминал (SSH в браузере)

**Как работает:**
1. Пользователь нажимает кнопку "Терминал" на запущенной ВМ
2. Frontend открывает WebSocket соединение к `/api/v1/terminal/ws/{instance_id}`
3. Control Plane аутентифицирует JWT токен
4. Создаётся Docker exec сессия (`/bin/sh`) через Unix socket
5. Устанавливается двунаправленный pipe: Browser ↔ WebSocket ↔ Docker exec
6. Пользователь получает полноценный терминал в браузере (xterm.js)

**Особенности:**
- Поддержка цветов, курсора, автодополнения
- Работа через ngrok (wss://)
- Диагностика ошибок подключения

**Файлы:**
- `control-plane/app/routers/terminal.py` — WebSocket сервер с Docker exec
- `frontend/src/components/TerminalModal.jsx` — UI терминала (xterm.js)

---

### 6. 📸 Система снапшотов (Backup/Restore)

**Возможности:**
- Создание снапшота работающей или остановленной ВМ
- Просмотр списка снапшотов с размером и датой
- Восстановление ВМ из снапшота
- Каскадное удаление снапшотов при удалении ВМ

**Как работает:**
1. `docker commit` — создание Docker image из контейнера
2. Сохранение метаданных в БД (имя, размер, статус)
3. При восстановлении — пересоздание контейнера из сохранённого image

**Файлы:**
- `control-plane/app/grpc_client.py` — `create_snapshot_via_grpc()`, `restore_snapshot_via_grpc()`
- `frontend/src/components/BackupManager.jsx` — UI управления снапшотами

---

### 7. 🛡️ Админ-панель с массовыми операциями

**Функционал:**
- **Обзор кластера** — графики, статистика, состояние ноды
- **Управление тенантами** — создание, удаление, редактирование квот, управление участниками
- **Управление пользователями** — просмотр, назначение/переназначение тенантов
- **Запросы доступа** — одобрение/отклонение с выбором тенанта и комментарием
- **Биллинг платформы** — доход, графики, топ тенантов

**Массовые операции (Bulk Actions):**
| Действие | Описание |
|----------|----------|
| Остановить все ВМ | Экстренная остановка всех запущенных инстансов на платформе |
| Стоп тенант | Остановка всех ВМ конкретного тенанта |
| Удалить по образу | Удаление всех ВМ с определённым образом ОС (например, все ubuntu) |

**Файлы:**
- `control-plane/app/routers/admin.py` — `/bulk-action` endpoint
- `frontend/src/pages/AdminDashboard.jsx` — панель "Управление и безопасность"

---

### 8. 🎨 Брендинг Тучка МТС

- Логотип на всех страницах (Login, Register, Dashboard, Admin)
- Цветовая схема МТС: основной цвет `#E30611` (красный МТС)
- Русскоязычный интерфейс
- Favicon — логотип Тучка МТС
- Title: "Тучка МТС — Облачная платформа"

---

### 9. 📞 Контакты и поддержка

- Вкладка "Контакты" в пользовательском дашборде
- Техподдержка: телефон, email, Telegram
- Отдел продаж: корпоративный телефон, email, адрес офиса
- Инструкция для новых компаний (3 шага подключения)
- Контактная информация на странице регистрации

---

## 🗄️ Модель данных

```
Users ──┬── TenantMembers ──── Tenants ──┬── Quotas
        │                                ├── Instances ──── Backups
        └── TenantRequests ──────────────┘
```

| Таблица | Описание |
|---------|----------|
| `users` | Пользователи (email, password, role: ADMIN/CLIENT) |
| `tenants` | Организации-тенанты |
| `tenant_members` | Связь пользователь-тенант (с флагом is_owner) |
| `quotas` | Лимиты ресурсов тенанта (max_vcpu, max_ram_mb, max_instances) |
| `instances` | Виртуальные машины (vcpu, ram_mb, image, status, ip_address) |
| `tenant_requests` | Запросы на доступ (status: PENDING/APPROVED/REJECTED) |
| `backups` | Снапшоты ВМ (snapshot_image, size_mb, status) |

---

## 🔧 Технологический стек

| Компонент | Технология | Версия |
|-----------|-----------|--------|
| Frontend | React | 19.2 |
| Bundler | Vite | 7.3 |
| CSS | Tailwind CSS | 3.4 |
| Charts | Recharts | 3.7 |
| Terminal | xterm.js | 5.3 |
| HTTP Client | Axios | 1.13 |
| Backend | FastAPI (Python) | latest |
| ORM | SQLAlchemy (async) | latest |
| Database | PostgreSQL | latest |
| Auth | JWT (python-jose) | latest |
| Compute | Go + gRPC | 1.x |
| Containers | Docker Engine | latest |
| Protocol | gRPC + Protobuf | latest |
| Orchestration | Docker Compose | latest |

---

## 🚀 Запуск проекта

```bash
# 1. Запуск всех сервисов
docker-compose up --build

# 2. Инициализация БД (seed данные)
python control-plane/seed.py

# 3. Для разработки frontend
cd frontend && npm install && npm run dev
```

---

## 📁 Структура проекта

```
hackaton-iaas/
├── docker-compose.yml          # Оркестрация сервисов
├── proto/cloud.proto           # gRPC протокол
│
├── control-plane/              # Python FastAPI Backend
│   ├── app/
│   │   ├── main.py             # Точка входа FastAPI
│   │   ├── database.py         # Подключение к PostgreSQL
│   │   ├── grpc_client.py      # gRPC клиент к Compute Node
│   │   ├── core/
│   │   │   ├── config.py       # Конфигурация
│   │   │   └── security.py     # JWT токены
│   │   ├── models/
│   │   │   └── base.py         # SQLAlchemy модели
│   │   ├── routers/
│   │   │   ├── auth.py         # Аутентификация
│   │   │   ├── instances.py    # CRUD виртуальных машин
│   │   │   ├── admin.py        # Админ-панель API
│   │   │   ├── billing.py      # Биллинг API
│   │   │   ├── terminal.py     # WebSocket терминал
│   │   │   └── deps.py         # Зависимости (get_current_user)
│   │   ├── schemas/            # Pydantic схемы
│   │   └── services/           # Бизнес-логика
│   ├── seed.py                 # Начальные данные
│   └── Dockerfile
│
├── compute-node/               # Go gRPC Compute Service
│   ├── main.go                 # gRPC сервер + Docker управление
│   ├── go.mod / go.sum
│   └── Dockerfile
│
└── frontend/                   # React SPA
    ├── src/
    │   ├── App.jsx             # Роутинг
    │   ├── pages/
    │   │   ├── Login.jsx       # Страница входа
    │   │   ├── Register.jsx    # Страница регистрации
    │   │   ├── Dashboard.jsx   # Пользовательский дашборд
    │   │   └── AdminDashboard.jsx  # Админ-панель
    │   ├── components/
    │   │   ├── CreateInstanceModal.jsx   # Мастер создания ВМ
    │   │   ├── TerminalModal.jsx         # Веб-терминал
    │   │   ├── InstanceMonitoringModal.jsx # Мониторинг ВМ
    │   │   ├── BackupManager.jsx         # Управление снапшотами
    │   │   ├── EditQuotaModal.jsx        # Редактирование квот
    │   │   ├── CreateTenantModal.jsx     # Создание тенанта
    │   │   └── AssignUserModal.jsx       # Назначение пользователя
    │   ├── contexts/AuthContext.jsx      # Контекст аутентификации
    │   ├── lib/api.js                    # Axios instance
    │   └── index.css                     # Стили (Tailwind + MTS theme)
    ├── public/logo.png          # Логотип Тучка МТС
    └── index.html               # HTML entry point
```
