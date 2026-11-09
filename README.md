# Al Precio Justo

El valor real de cada empresa de la bolsa de EE. UU. según sus reportes
trimestrales, frente a su precio de hoy.

**Demo:** https://iancelisb.github.io/al-precio-justo/

La demo es la app (Expo web) compilada en **modo demo**: lee una foto de los datos
de las ~1.000 empresas en vez de la API, entra como invitado (sin Google) y guarda
las empresas seguidas, las métricas y el simulador en el navegador. Se vuelve a
publicar con cada cambio en `main` y de lunes a viernes tras el cierre
([`.github/workflows/pages.yml`](.github/workflows/pages.yml)). La app real no
cambia: el modo demo solo se activa al compilar con `EXPO_PUBLIC_ANCLA_DEMO=1`
(ver [`apps/movil/src/demo.ts`](apps/movil/src/demo.ts)).

| Carpeta | Qué es | Tecnología |
|---|---|---|
| `ingesta/` | Lee los reportes de la SEC y los precios; llena la base de datos | Python |
| `packages/valoracion/` | Motor de valoración compartido por la API, la web y el móvil | TypeScript |
| `apps/api/` | API: empresas, precio, valor y estado | TypeScript + Fastify |
| `apps/web/` | Web | Next.js |
| `apps/movil/` | App de iOS y Android | React Native + Expo |

## Diseño «cine»

Web y móvil comparten el mismo lenguaje visual: **claro por defecto** (degradado violeta → turquesa, tipografías Bricolage Grotesque y Figtree), con tema oscuro tipo cine (fondo casi negro, tarjetas grafito) y cuatro acentos en Configuración (`packages/valoracion/src/apariencia.ts`).

- **Portada**: destacadas que rotan cada 7 s sobre una aurora animada (oportunidad del día, idea prudente, la que más sube en el año, refugio defensivo), filtros (Para ti, Popularidad, Por sector, Ciclo económico, Descubrimientos) y filas de carruseles con las ~1.000 empresas: Mi lista, Top 10 (con números grandes; las más vistas de la semana o, sin datos de uso, las más grandes), Oportunidades, Ideas prudentes, En alza, Descubrimientos, Defensivas y Cíclicas. La lógica está en `packages/valoracion/src/portada.ts` y la sirve `GET /portada?filtro=` (la demo la calcula en el navegador).
- **Pósters**: degradado del color del sector con un matiz propio por empresa, su logo, el cambio del precio en 12 meses y su estado frente al valor.
- **Ficha**: cabecera tipo panel con el degradado de la empresa, etiquetas (sector, tipo, índice, idea prudente), precio, cambio en el año, valor estimado y «+ Mi lista». Debajo, todo lo de antes: gráfico de valor, Tu modelo, análisis, sobre la empresa, simulador, máquina del tiempo y métricas.

## Universo (prototipo: ~1.000 empresas)

`ingesta/universo.py` arma la lista y la guarda en `ingesta/universo.json`: **S&P 500 + S&P 400 + ~70 populares** entre inversores minoristas (MercadoLibre, Snowflake, Roblox, SoFi…), 971 en total. Solo empresas que presentan 10‑Q/10‑K; las extranjeras (20‑F) y las chilenas (CMF) quedan para cuando escalemos. Para cambiar las populares, edita `POPULARES` y vuelve a armar la lista con `universo.lista(client, refrescar=True)`.

**Espacio**: de cada documento solo se guardan las ~40 etiquetas que usan las métricas (un 8 % de sus cifras, con resultados idénticos) y el documento se borra tras leerlo. Con `ANCLA_GUARDAR_DOCUMENTOS=1` se conservan los documentos y todas sus cifras.

## Demo estática

```bash
npm run api                                   # en otra terminal: la API con datos
node apps/api/src/foto-demo.ts                # foto de los datos en apps/movil/public/
cd apps/movil
EXPO_PUBLIC_ANCLA_DEMO=1 EXPO_PUBLIC_BASE=/al-precio-justo EXPO_BASE_URL=/al-precio-justo npx expo export --platform web
```

En GitHub hay que definir el secreto `SEC_USER_AGENT` (nombre y email de contacto para la SEC) y activar Pages con origen «GitHub Actions».

## Puesta en marcha

Requisitos: Python 3.11+ y Node 24+.

```bash
npm install
py -m ingesta.ejecutar --todas        # trimestres de las ~1.000 empresas (~6 min)
py -m ingesta.precios --todas         # 10 años de precios diarios (~15 min)
npm run api                           # http://localhost:4000
npm run web                           # http://localhost:3000
npm run movil                         # Expo: escanea el QR con Expo Go, o pulsa "w" para web
npm test                              # pruebas del motor de valoración, la API y los avisos
```

La API guarda usuarios y avisos en Postgres; sin `DATABASE_URL` usa PGlite en `data/pg` (ver «Base de datos»).

En un teléfono, `localhost` es el propio teléfono: arranca el móvil con
`EXPO_PUBLIC_ANCLA_API=http://<IP de tu ordenador>:4000`.

## Modelo de valoración

`packages/valoracion` calcula, por acción:

1. **Flujo de caja libre base**: promedio anual de los últimos 3 años (o 12 meses si no hay tanta historia).
2. **Crecimiento** de los próximos 5 años: el de las ventas de los últimos 5 años, entre 0 % y 12 %.
3. **Recompra neta**: recompras − emisión de los últimos 12 meses sobre la capitalización. Sube el flujo por acción.
4. Se descuenta al **9 %** con un crecimiento a perpetuidad del **2,5 %** y se resta la deuda neta por acción.
5. **Banda de valor** ±15 %. Precio por encima: *cara*; por debajo: *barata*; dentro: *justa*.

No se valoran bancos ni aseguradoras (su caja no mide lo mismo), ni empresas con
flujo de caja libre negativo. Todos los supuestos se pueden cambiar (`valorar(..., { supuestos })`).

### Gráfico «precio frente a su valor» y «Tu modelo»

`packages/valoracion/src/grafico.ts` recalcula el valor tras cada reporte con
**solo lo que se sabía entonces** (cada trimestre cuenta 45 días después de su
cierre, cuando se presenta a la SEC). La web y el móvil dibujan el precio semanal
sobre esa banda escalonada (1, 3, 5 o 10 años) y dicen qué parte del tiempo
estuvo barata, justa o cara. En «Tu modelo» el usuario cambia crecimiento,
rentabilidad exigida, crecimiento a perpetuidad y recompra neta: la banda y el
valor se recalculan al instante en el dispositivo y se guardan en él.

### Sobre la empresa

`ingesta/perfil.py` arma el perfil de cada empresa con fuentes públicas:

- **Descripción**: el resumen de su artículo en Wikipedia en español (en inglés si no hay), encontrado por su número de la SEC (CIK) en Wikidata. Se muestra con el enlace a la fuente (licencia CC BY-SA).
- **Ficha**: fundación, sede, CEO, empleados y web (Wikidata); industria, bolsa y cierre del año fiscal (SEC).
- **¿De dónde vienen sus ingresos?**: ventas por negocio, producto y región del último 10-K, leídas por el propio lector de documentos (`lector.read_inline_segments`) con los nombres que usa la empresa.
- **Datos clave** (`packages/valoracion/src/perfil.ts`): capitalización, PER, rentabilidad por dividendo, rango de 52 semanas y beta frente al S&P 500 (2 años, semanal).

```bash
py -m ingesta.perfil --todas          # ~35 min para ~1.000 empresas
```

### Configuración: tema, color y divisa

Web (`/configuracion`, cookie `apj_pref`) y móvil (Perfil → Configuración, guardado en el dispositivo):

- **Tema**: como el sistema, claro u oscuro. **Color de acento**: menta, azul, violeta o ámbar (el verde de «barata» y el rojo de «cara» no cambian).
- **Divisa**: USD, CLP, EUR, MXN, BRL, GBP, CAD, CHF o JPY. Todos los datos están en USD y se convierten al mostrarlos (`establecerDivisa` en `formato.ts`). El simulador y la máquina del tiempo siguen en USD.
- **Tipos de cambio** (`ingesta/divisas.py`, una vez al día con el programador): tasas de referencia del **Banco Central Europeo** (api.frankfurter.dev) y **dólar observado del Banco Central de Chile** (mindicador.cl). `GET /divisas` las entrega con su fecha y fuente.

### Uso anónimo y tendencias

`apps/api/src/analitica.ts` guarda en la base Postgres (tabla `eventos`) qué empresas se **ven** (enviado por la app con un número aleatorio por dispositivo, sin usuario ni email), se **siguen** y se **compran** en el simulador (contados en el servidor, sin sesión). Se puede desactivar en Configuración y los eventos se borran a los 180 días.

- `GET /tendencias?dias=7`: las más vistas (sesiones distintas), seguidas y compradas, con el periodo anterior para ver si suben. La app muestra «Lo más visto esta semana».
- `GET /empresas/:ticker/tambien`: «quienes vieron X también vieron…» (mínimo 2 sesiones en 30 días).

Para analizar los datos:

```sql
-- psql "$DATABASE_URL"  (o el editor SQL del panel de Neon)
SELECT ticker, COUNT(DISTINCT sesion) AS personas FROM eventos
WHERE tipo = 'vista' AND dia >= to_char(now() - interval '30 days', 'YYYY-MM-DD') GROUP BY ticker ORDER BY personas DESC LIMIT 20;

-- De lo visto a lo comprado: qué empresas pasan de la curiosidad al simulador
SELECT v.ticker, v.n AS vistas, COALESCE(c.n, 0) AS compras, ROUND(1.0 * COALESCE(c.n, 0) / v.n, 3) AS conversion
FROM (SELECT ticker, COUNT(*) n FROM eventos WHERE tipo = 'vista' GROUP BY ticker) v
LEFT JOIN (SELECT ticker, COUNT(*) n FROM eventos WHERE tipo = 'compra' GROUP BY ticker) c USING (ticker)
ORDER BY vistas DESC LIMIT 20;

-- Pares de empresas que se miran juntas (base para recomendaciones)
SELECT a.ticker AS empresa, b.ticker AS tambien, COUNT(DISTINCT a.sesion) AS sesiones
FROM eventos a JOIN eventos b ON a.sesion = b.sesion AND a.ticker < b.ticker
WHERE a.tipo = 'vista' AND b.tipo = 'vista' GROUP BY 1, 2 HAVING sesiones >= 3 ORDER BY sesiones DESC LIMIT 30;
```

En la demo de GitHub Pages no hay servidor: las vistas se cuentan solo en ese navegador.

## Búsqueda con criterio prudente

`packages/valoracion/src/recomendaciones.ts` analiza cada empresa con las mismas reglas:

- **Tipo**: *defensiva* (consumo básico, salud, servicios públicos), *cíclica* (energía, materiales, o ventas que cayeron más de un 25 % alguna vez) o *estable*.
- **Calidad 0-100**: caja positiva y constante, margen de caja, crecimiento de ventas, deuda frente a caja, dilución y pagos en acciones. Caja irregular, deuda de más de 6 años de caja o dilución de más del 8 % anual la descartan.
- **Precio de compra** = valor estimado − margen de seguridad: 15 % defensivas, 20 % estables, 35 % cíclicas.
- **Sugerida**: calidad ≥ 60, sin motivos de descarte y precio por debajo del precio de compra. Una cíclica a menos de la mitad de su valor no se sugiere (su caja suele estar en un pico del ciclo): queda «para vigilar».

Son reglas fijas, iguales para todos, con sus razones a la vista. No es asesoría financiera.

## Cuentas con Google

La web y el móvil obtienen un *ID token* de Google y la API lo verifica (firma y destinatario) antes de crear la sesión. La API guarda solo nombre, email, foto, empresas seguidas, métricas elegidas y avisos (base Postgres, ver más abajo). El usuario puede borrar su cuenta desde Perfil.

Para activarlo:

1. En [Google Cloud Console](https://console.cloud.google.com/apis/credentials) crea un proyecto y una pantalla de consentimiento OAuth.
2. Crea IDs de cliente OAuth: uno **Web** (orígenes autorizados: `http://localhost:3000`, `http://localhost:8081` y `https://iancelisb.github.io`; URI de redirección: `https://iancelisb.github.io/al-precio-justo`), uno **iOS** (bundle `app.alpreciojusto`) y uno **Android** (paquete `app.alpreciojusto` + huella SHA-1).
3. Configura las variables:

| Dónde | Variable | Valor |
|---|---|---|
| API | `GOOGLE_CLIENT_IDS` | los tres IDs, separados por comas |
| API | `ANCLA_SECRETO` | una clave larga y aleatoria (obligatoria en producción) |
| Web | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | el ID Web |
| Móvil | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `..._IOS_...`, `..._ANDROID_...` | cada ID |

En desarrollo, `ANCLA_LOGIN_PRUEBA=1` en la API añade un botón «Entrar con un usuario de prueba» (nunca se activa con `NODE_ENV=production`).

## Simulador (dinero ficticio, precios reales)

`packages/valoracion/src/simulador.ts`:

- **Cartera simulada**: cada usuario con sesión empieza con 30.000 USD ficticios. Compra por importe (acciones fraccionadas) y vende acciones al precio del momento, sin comisiones. La ganancia se calcula por coste medio y separa lo ya ganado al vender de lo que sigue en cartera. Se compara cada día con lo que habría valido la misma cantidad en el S&P 500 (SPY). Se puede reiniciar.
- **Máquina del tiempo**: «si hubieras invertido $X hace N años», con los cierres reales de los últimos 10 años y la comparación con el S&P 500. No necesita sesión.
- El precio lo pone siempre la API (el cliente no puede elegirlo). Las operaciones se guardan en Postgres (tabla `operaciones`) y se borran con la cuenta.

## Avisos dentro de la app

`packages/valoracion/src/avisos.ts` (tipos, ajustes y textos) y `apps/api/src/avisos.ts` (detector y tablas). Cada usuario elige qué avisos quiere en la pantalla **Avisos** (campana en la barra de la web y arriba en el inicio del móvil):

| Aviso | Cuándo | Por defecto |
|---|---|---|
| Precio objetivo | la acción llega al precio que fijaste en la ficha («🔔 Avisarme») | **activado** |
| Cambio de estado | una empresa que sigues pasa a barata, justa o cara | apagado |
| Nuevo reporte | una empresa que sigues publica un trimestre nuevo | apagado |
| Movimiento fuerte | una empresa que sigues sube o baja ±3, 5 o 10 % en el día | apagado |

La API revisa cada vez que recalcula las empresas (nuevos precios o reportes, como mínimo cada 5 minutos): compara con la última foto de cada empresa (`foto_empresas`) y crea los avisos con una clave única por usuario, así que nunca se repiten. Un precio objetivo se cumple una vez y queda como «cumplido». Se guardan los últimos 200 avisos por usuario.

Rutas: `GET /yo/avisos`, `PUT /yo/avisos/leidos`, `GET|PUT /yo/avisos/ajustes`, `GET /yo/objetivos`, `PUT|DELETE /yo/objetivos/:ticker`. En la demo de GitHub Pages se guardan en el navegador y, como los precios son una foto fija, solo puede cumplirse un precio objetivo.

## Base de datos (Postgres)

Usuarios, seguidas, simulador, preferencias, uso anónimo y avisos viven en **Postgres** (`apps/api/src/bd.ts`, con migraciones numeradas que se aplican solas al arrancar):

- **Producción**: `DATABASE_URL` (Neon u otro Postgres).
- **Desarrollo y pruebas**: sin `DATABASE_URL` la API usa **PGlite**, el mismo Postgres embebido en el proceso (`data/pg`; en memoria en las pruebas). No hay que instalar nada.

Los datos de mercado (reportes de la SEC y precios) siguen en el SQLite que arma la ingesta, que la API solo lee.

## Publicar la API (Neon + Render + Google)

La página de GitHub funciona sola en modo demo. Para tener cuentas reales, avisos y base de datos, la app necesita la API en internet. Todo en planes gratis:

1. **Neon** (Postgres): crea una cuenta en [neon.tech](https://neon.tech), un proyecto en la región *AWS US East (N. Virginia)* y copia la *connection string* (`postgresql://…?sslmode=require`).
2. **Render** (API): crea una cuenta en [render.com](https://render.com), conecta GitHub y elige **New → Blueprint** con este repositorio (usa `render.yaml`). Te pedirá:
   - `DATABASE_URL`: la cadena de Neon.
   - `GOOGLE_CLIENT_IDS`: los IDs de cliente de Google (ver «Cuentas con Google»).
   `ANCLA_SECRETO` se genera solo. La API descarga los datos de mercado de la versión [`datos`](https://github.com/IanCelisB/al-precio-justo/releases/tag/datos) que publica GitHub Actions y los vuelve a mirar cada 6 horas. Prueba: `https://<tu-servicio>.onrender.com/estado-datos` debe decir `"base": "postgres"`.
3. **GitHub** (la página): en *Settings → Secrets and variables → Actions → Variables* crea:
   - `API_URL` = `https://<tu-servicio>.onrender.com`
   - `GOOGLE_WEB_CLIENT_ID` = el ID de cliente Web de Google
   y vuelve a ejecutar el workflow «Demo en GitHub Pages». Con `API_URL` la página deja de ser demo y usa la API real. Para volver a la demo, borra la variable.

En el plan gratis de Render el servidor se duerme tras 15 minutos sin uso: la primera visita después tarda ~1 minuto en despertar (descarga la base de mercado). Neon gratis da 0,5 GB, de sobra para miles de usuarios.

## Logos

La API sirve `/logos/:ticker`: descarga cada logo una vez, lo guarda en `data/logos/` y lo sirve desde ahí. Si no hay logo, las apps muestran la ilustración del sector. El proveedor se cambia con `ANCLA_LOGO_URL` (plantilla con `{ticker}`). El de por defecto es público y sin contrato; los logos son marcas de cada empresa, así que para publicar conviene un proveedor con licencia (Brandfetch, logo.dev).

**Precios**: `ingesta/precios.py` usa por ahora el endpoint público de Yahoo
Finance, que no tiene licencia de redistribución. Antes de publicar hay que
cambiarlo por un proveedor con licencia.

# Ingesta de datos

Descarga los reportes trimestrales (10‑Q y 10‑K) que las empresas presentan a la
SEC y calcula, para cada trimestre, las métricas de la app:

| Métrica en la app      | Clave              | Cómo se obtiene |
|------------------------|--------------------|-----------------|
| Ventas                 | `revenue`          | Primera etiqueta XBRL disponible de una lista de preferencia |
| Beneficios             | `net_income`       | `NetIncomeLoss` y alternativas |
| Flujo de caja libre    | `free_cash_flow`   | Caja de las operaciones − inversión en activos |
| Emisión de acciones    | `stock_issuance`   | Dinero recibido por acciones nuevas (además `stock_comp`: pagos en acciones) |
| Recompras de acciones  | `buybacks`         | Caja usada en recomprar (además `net_buybacks` = recompras − emisión) |
| Deuda                  | `debt`, `net_debt` | Deuda a largo y corto plazo; neta = deuda − caja e inversiones a corto |
| Dividendos             | `dividends`        | Dividendos pagados |

## Requisitos

Python 3.11 o superior. No necesita librerías externas.

## Uso

```bash
py -m ingesta.ejecutar --tickers AAPL,MSFT,JPM      # empresas concretas
py -m ingesta.ejecutar --todas --export             # todo el universo + un JSON por empresa
py -m unittest discover -s tests -t .               # pruebas
```

Resultado:
- `data/ancla.db`: base SQLite con las tablas `companies`, `fundamentals_q` y `quality_issues`.
- `data/export/<TICKER>.json`: lo que consumirá la app.
- `data/raw/`: caché de las descargas de la SEC (se renueva cada 24 h).

## Proceso de reportes (lee los documentos)

`ingesta.proceso` no usa las cifras ya procesadas por la API de la SEC: obtiene
cada 10‑Q y 10‑K, lo lee y extrae las cifras él mismo.

```bash
py -m ingesta.proceso --tickers AAPL,MSFT --desde 2015-01-01
py -m ingesta.proceso --todas --export        # todo el universo (varias horas la primera vez)
py -m ingesta.proceso --tickers AAPL --comparar   # contrasta con la API de la SEC
py -m ingesta.proceso --todas --releer        # tras mejorar el lector (vuelve a descargar si no se guardan los documentos)
py -m ingesta.proceso --todas --reintentar    # vuelve a intentar los reportes con error
```

Etapas de cada reporte (tabla `filings`):

1. **Descubrir**: la lista de presentaciones de la empresa en EDGAR; cada 10‑Q/10‑K nuevo entra en la cola como `pendiente`.
2. **Descargar**: el documento del reporte se guarda comprimido en `data/filings/<CIK>/`. Pasa a `descargado`.
3. **Leer** (`lector.py`): extrae todas las cifras etiquetadas del documento (tabla `facts`). Pasa a `leido`, o a `error` con el motivo.
4. **Calcular**: las mismas reglas de normalización de abajo convierten las cifras en las 7 métricas por trimestre.

Es incremental: si se ejecuta cada día, solo descarga y lee los reportes nuevos.

**Formato de los documentos.** Los reportes oficiales de la SEC no son PDF. Desde
2019 son HTML con *Inline XBRL*: cada cifra de los estados financieros lleva una
etiqueta que indica qué es, de qué periodo y en qué unidad. Entre 2009 y 2019 las
mismas cifras venían en un archivo XBRL (XML) dentro de la presentación. El
lector entiende los dos formatos. Las presentaciones anteriores a 2009‑2011 no
tienen cifras etiquetadas y quedan como `sin_xbrl`.

Algunas empresas presentan el 10‑K como una «carcasa» y ponen los estados
financieros en un anexo (p. ej. Pfizer). Si el documento principal tiene pocas
cifras, el proceso busca los demás documentos de la presentación y los lee juntos.

Al leer: se ignoran los desgloses por segmento o producto; si una cifra aparece
varias veces (p. ej. exacta en la tabla y redondeada a «$0.4 billion» en el texto)
se usa la más precisa; los paréntesis son presentación, el signo viene de la
etiqueta.

## Actualización automática

`ingesta.actualizar` mantiene los datos al día cuando las empresas presentan reportes nuevos:

1. **Detectar**: lee el índice diario de EDGAR (todas las presentaciones de cada día, ~5.000) y se queda con los 10‑Q / 10‑K de las empresas del universo. Recuerda el último día revisado (`estado_ingesta`), así que retoma donde lo dejó aunque haya estado apagado.
2. **Procesar**: el proceso de reportes descarga y lee cada documento. **Los documentos son la única fuente de las cifras.** La primera vez que una empresa presenta algo se lee también su historia desde 2009 (~30 s); `--migrar N` adelanta ese trabajo.
3. **Revisar** (`ingesta/calidad.py`): compara el resultado con lo publicado y con la API de la SEC (verificación cruzada). Es **grave** que desaparezcan trimestres publicados, que un trimestre pasado cambie más de un 20 % sin que la SEC lo confirme, que el trimestre nuevo no coincida con la SEC (±2 %), que le falten ventas o flujo de caja, o que las acciones o las ventas den un salto sin confirmar.
4. **Publicar o cuarentena**: si no hay nada grave se actualiza `fundamentals_q` y la API lo muestra en menos de un minuto. Si hay algo grave, la app sigue mostrando lo anterior, el reporte queda **en cuarentena** y se envía una alerta (consola y, si se define `ANCLA_ALERTAS_WEBHOOK`, un webhook de Slack o Discord).

```bash
py -m ingesta.programador                  # cada hora: reportes nuevos; tras el cierre: precios del día
py -m ingesta.programador --una-vez        # una vuelta (para cron o el Programador de tareas)
py -m ingesta.programador --migrar 10      # además pasa 10 empresas por vuelta a datos de documentos
py -m ingesta.actualizar --cuarentena      # qué quedó pendiente de revisar y por qué
py -m ingesta.actualizar --aprobar AAPL    # publicarlo igualmente
py -m ingesta.actualizar --rechazar AAPL   # descartarlo (sus cifras no se usan)
```

En desarrollo se deja corriendo así (escribe en `data/actualizador.log`):

```bash
set SEC_USER_AGENT=AlPrecioJusto tu-email@dominio.com
py -u -m ingesta.programador --cada 60 --migrar 20 >> data/actualizador.log 2>&1
```

La base usa el modo WAL de SQLite: la API lee mientras la ingesta escribe.

Cada reporte procesado queda en la tabla `actualizaciones` (publicado, sin cambios, en cuarentena, aprobado, rechazado o error). La API expone `GET /novedades` (últimos reportes publicados, para avisar a los usuarios) y `GET /estado-datos` (hasta qué día se revisó, precios, cuántas en cuarentena).

**Pendiente para producción**: pasar de SQLite a PostgreSQL (el esquema es compatible) y lanzar el programador como servicio. Hoy la API recalcula sola cuando cambia la base.

## Identificación ante la SEC

La SEC pide que cada cliente automático se identifique con un nombre y un
email de contacto. Antes de usarlo de forma continuada:

```bash
set SEC_USER_AGENT=AlPrecioJusto tu-email@dominio.com
```

Sin esa variable, la API de datos funciona, pero `www.sec.gov` rechaza las
peticiones: tanto el listado de tickers como **los documentos de los reportes**.
El proceso de reportes necesita esta variable.

## Reglas de normalización

- **Q4**: no hay 10‑Q del cuarto trimestre; se calcula como anual − 9 meses.
- **Flujos de caja**: llegan acumulados en el año; cada trimestre es la diferencia entre acumulados consecutivos.
- **Reexpresiones**: para los trimestres reportados directamente gana la cifra presentada más tarde. Para los calculados se usan cifras de la misma época, para no mezclar números antes y después de una reexpresión.
- **Cambio de CIK**: `universo.PREDECESSOR_CIKS` une la historia de empresas que crearon una nueva sociedad matriz (p. ej. Exxon).
- **Trimestre natural**: los cierres de años de 52/53 semanas se asignan al trimestre natural correspondiente (`2026-Q3`).

## Limitaciones conocidas

- El proceso de reportes tarda unos 30 s por empresa con 17 años de historia (límite de 10 peticiones por segundo de la SEC): unas 4 horas para el S&P 500 la primera vez y minutos al día después. Los documentos guardados ocupan unos 13 MB por empresa comprimidos (unos 6,5 GB para el S&P 500).

- Bancos y aseguradoras no tienen inversión en activos comparable: su flujo de caja libre es solo la caja operativa, y la deuda neta no tiene sentido. La app debe usar otro modelo para ellos.
- Unas 80 empresas no tienen deuda reconocible con las etiquetas estándar (p. ej. Berkshire usa etiquetas propias).
- Las listas del S&P 500 y S&P 400 salen de Wikipedia. En producción deben venir de una fuente con licencia.
