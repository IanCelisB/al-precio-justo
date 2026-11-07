# Ancla

El valor real de cada empresa de la bolsa de EE. UU. según sus reportes
trimestrales, frente a su precio de hoy.

| Carpeta | Qué es | Tecnología |
|---|---|---|
| `ingesta/` | Lee los reportes de la SEC y los precios; llena la base de datos | Python |
| `packages/valoracion/` | Motor de valoración compartido por la API, la web y el móvil | TypeScript |
| `apps/api/` | API: empresas, precio, valor y estado | TypeScript + Fastify |
| `apps/web/` | Web | Next.js |
| `apps/movil/` | App de iOS y Android | React Native + Expo |

## Universo (prototipo: ~1.000 empresas)

`ingesta/universo.py` arma la lista y la guarda en `ingesta/universo.json`: **S&P 500 + S&P 400 + ~70 populares** entre inversores minoristas (MercadoLibre, Snowflake, Roblox, SoFi…), 971 en total. Solo empresas que presentan 10‑Q/10‑K; las extranjeras (20‑F) y las chilenas (CMF) quedan para cuando escalemos. Para cambiar las populares, edita `POPULARES` y vuelve a armar la lista con `universo.lista(client, refrescar=True)`.

**Espacio**: de cada documento solo se guardan las ~40 etiquetas que usan las métricas (un 8 % de sus cifras, con resultados idénticos) y el documento se borra tras leerlo. Con `ANCLA_GUARDAR_DOCUMENTOS=1` se conservan los documentos y todas sus cifras.

## Puesta en marcha

Requisitos: Python 3.11+ y Node 24+.

```bash
npm install
py -m ingesta.ejecutar --todas        # trimestres de las ~1.000 empresas (~6 min)
py -m ingesta.precios --todas         # 10 años de precios diarios (~15 min)
npm run api                           # http://localhost:4000
npm run web                           # http://localhost:3000
npm run movil                         # Expo: escanea el QR con Expo Go, o pulsa "w" para web
npm test                              # pruebas del motor de valoración
```

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

## Búsqueda con criterio prudente

`packages/valoracion/src/recomendaciones.ts` analiza cada empresa con las mismas reglas:

- **Tipo**: *defensiva* (consumo básico, salud, servicios públicos), *cíclica* (energía, materiales, o ventas que cayeron más de un 25 % alguna vez) o *estable*.
- **Calidad 0-100**: caja positiva y constante, margen de caja, crecimiento de ventas, deuda frente a caja, dilución y pagos en acciones. Caja irregular, deuda de más de 6 años de caja o dilución de más del 8 % anual la descartan.
- **Precio de compra** = valor estimado − margen de seguridad: 15 % defensivas, 20 % estables, 35 % cíclicas.
- **Sugerida**: calidad ≥ 60, sin motivos de descarte y precio por debajo del precio de compra. Una cíclica a menos de la mitad de su valor no se sugiere (su caja suele estar en un pico del ciclo): queda «para vigilar».

Son reglas fijas, iguales para todos, con sus razones a la vista. No es asesoría financiera.

## Cuentas con Google

La web y el móvil obtienen un *ID token* de Google y la API lo verifica (firma y destinatario) antes de crear la sesión. La API guarda solo nombre, email, foto, empresas seguidas y métricas elegidas (`data/usuarios.db`). El usuario puede borrar su cuenta desde Perfil.

Para activarlo:

1. En [Google Cloud Console](https://console.cloud.google.com/apis/credentials) crea un proyecto y una pantalla de consentimiento OAuth.
2. Crea IDs de cliente OAuth: uno **Web** (orígenes autorizados: `http://localhost:3000` y tu dominio), uno **iOS** (bundle `app.ancla`) y uno **Android** (paquete `app.ancla` + huella SHA-1).
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
- El precio lo pone siempre la API (el cliente no puede elegirlo). Las operaciones se guardan en `data/usuarios.db` (tabla `operaciones`) y se borran con la cuenta.

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
set SEC_USER_AGENT=Ancla tu-email@dominio.com
py -u -m ingesta.programador --cada 60 --migrar 20 >> data/actualizador.log 2>&1
```

La base usa el modo WAL de SQLite: la API lee mientras la ingesta escribe.

Cada reporte procesado queda en la tabla `actualizaciones` (publicado, sin cambios, en cuarentena, aprobado, rechazado o error). La API expone `GET /novedades` (últimos reportes publicados, para avisar a los usuarios) y `GET /estado-datos` (hasta qué día se revisó, precios, cuántas en cuarentena).

**Pendiente para producción**: pasar de SQLite a PostgreSQL (el esquema es compatible) y lanzar el programador como servicio. Hoy la API recalcula sola cuando cambia la base.

## Identificación ante la SEC

La SEC pide que cada cliente automático se identifique con un nombre y un
email de contacto. Antes de usarlo de forma continuada:

```bash
set SEC_USER_AGENT=Ancla tu-email@dominio.com
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
