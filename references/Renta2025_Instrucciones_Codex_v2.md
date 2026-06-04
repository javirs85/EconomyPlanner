# Renta2025 / Personal Investment Tracker — Instrucciones para Codex

## Objetivo del proyecto

Construir una aplicación personal para seguimiento mensual de patrimonio financiero.

La aplicación NO debe ser una app genérica de finanzas personales, ni un clon de una app de presupuestos, ni una herramienta fiscal. Su objetivo principal es responder de forma visual y rápida:

1. ¿Cuánto patrimonio financiero tenemos?
2. ¿Cuánto viene de nuestro trabajo / ahorro?
3. ¿Cuánto viene de rendimientos, intereses, bonos, dividendos o revalorización de inversiones?
4. ¿Está el dinero en cash o invertido?
5. ¿Cómo evoluciona todo esto mes a mes?

La pantalla principal debe estar dominada por un gráfico mensual de columnas apiladas.

---

## Stack recomendado

Aplicación local-first, sin backend servidor en la V1.

- React
- TypeScript
- Vite
- IndexedDB para persistencia local
- Dexie como wrapper de IndexedDB
- PapaParse para importar CSV
- Recharts para visualización
- CSS/Tailwind/vanilla CSS según preferencia del proyecto

Todo el dominio, parser, cálculos y persistencia viven en el cliente. Esto no es "backend" servidor; es una capa de dominio y aplicación client-side.

---

## Arquitectura deseada

Estructura sugerida:

```txt
src/
  ui/
    pages/
    components/
    charts/
    forms/

  domain/
    transactions/
    snapshots/
    portfolio/
    metrics/
    valueObjects/

  application/
    importTradeRepublicCsv/
    monthlyClosing/
    dashboardQueries/

  infrastructure/
    persistence/
    csv/
    tradeRepublic/

  shared/
    utils/
    dates/
    money/
```

Separar claramente:

| Capa | Responsabilidad |
|---|---|
| UI | Pantallas, formularios, gráficos |
| Domain | Tipos financieros, reglas, cálculos puros |
| Application | Casos de uso: importar CSV, cerrar mes, generar dashboard |
| Infrastructure | IndexedDB, parser CSV, mapeo específico de Trade Republic |

---

## Fuentes de datos

### 1. Caixa

Entrada manual mensual simple:

- Saldo actual total de la cuenta Caixa

No se importan movimientos. Caixa se usa como cuenta de nómina, hipoteca y tarjeta de crédito. Para este sistema basta el saldo snapshot.

---

### 2. Trade Republic

Trade Republic se divide conceptualmente en dos bloques:

| Bloque | Significado |
|---|---|
| TR Cash | Cuenta corriente / tarjeta / liquidez de día a día |
| TR Investment | Cartera juguete / inversiones / bonos / acciones / BTC / etc. |

Cada mes el usuario introduce manualmente:

- Saldo actual de TR Cash
- Valor actual de TR Investment

Además, el usuario importa el CSV de Trade Republic.

El CSV de TR debe guardarse entero en la base de datos local, aunque inicialmente solo usemos una parte. No descartar columnas. En el futuro puede interesar estudiar gastos, tarjeta, categorías MCC, etc.

---

### 3. MyInvestor

Entrada manual mensual, separada por clase de activo.

Campos:

| Clase | Valor actual | Flujo externo mensual |
|---|---:|---:|
| Renta Variable | manual | manual |
| Renta Fija | manual | manual |
| Cripto | manual | manual |

Notas:

- Actualmente MyInvestor contiene principalmente fondos de renta variable y una pequeña parte cripto/BTC vía ETF.
- Aunque ahora no haya Renta Fija, mantener el campo para ser future-proof.
- El flujo externo puede ser positivo o negativo.
- Positivo = se aporta dinero nuevo.
- Negativo = se retira dinero para obtener liquidez.
- Cero = no ha habido entrada/salida externa.

Los cambios internos entre fondos no deben introducirse manualmente como movimientos si no sale dinero de MyInvestor.

---

## Workflow mensual esperado

La aplicación debe guiar al usuario una vez al mes, aproximadamente el día 4.

El periodo típico va desde el día 4 del mes anterior hasta el día 3 del mes actual.

Ejemplo:

```txt
Periodo: 04/05/2026 → 03/06/2026
```

La UI debe decir claramente al usuario:

```txt
Necesito que exportes el CSV de Trade Republic desde 04/05/2026 hasta 03/06/2026 y lo arrastres aquí.
```

Pasos del asistente mensual:

1. Introducir saldo actual Caixa.
2. Introducir saldo TR Cash.
3. Introducir valor TR Investment.
4. Importar CSV Trade Republic del periodo.
5. Introducir valores y flujos de MyInvestor:
   - RV value
   - RV flow
   - RF value
   - RF flow
   - Crypto value
   - Crypto flow
6. Mostrar resumen del mes.
7. Guardar MonthlySnapshot.

La experiencia debe ser rápida. Objetivo: menos de 5 minutos al mes.

---

## Modelo de datos principal

### MonthlySnapshot

Una fila por mes.

```ts
interface MonthlySnapshot {
  id: string;
  periodStart: string; // ISO date
  periodEnd: string;   // ISO date
  createdAt: string;

  caixaBalance: number;

  tradeRepublicCashBalance: number;
  tradeRepublicInvestmentValue: number;

  myInvestorEquityValue: number;
  myInvestorEquityFlow: number;

  myInvestorFixedIncomeValue: number;
  myInvestorFixedIncomeFlow: number;

  myInvestorCryptoValue: number;
  myInvestorCryptoFlow: number;
}
```

---

### RawTradeRepublicTransaction

Guardar todo lo que venga del CSV, normalizado en tipos pero sin perder información.

```ts
interface RawTradeRepublicTransaction {
  id: string;
  transactionId: string;

  datetime: string;
  date: string;

  accountType?: string;
  category?: string;
  type?: string;
  assetClass?: string;
  name?: string;
  symbol?: string;

  shares?: number;
  price?: number;
  amount?: number;
  fee?: number;
  tax?: number;

  currency?: string;

  originalAmount?: number;
  originalCurrency?: string;
  fxRate?: number;

  description?: string;

  counterpartyName?: string;
  counterpartyIban?: string;
  paymentReference?: string;
  mccCode?: string;

  raw: Record<string, string>;
}
```

Importante:

- Usar `transaction_id` como clave natural para evitar duplicados.
- Si el CSV viene con importes en micro-unidades, normalizar a euros. Ejemplo: `31370000` => `31.37`.
- Guardar también el valor raw original por seguridad.

---

### DomainTransaction

El dominio no debe depender directamente de los nombres exactos de Trade Republic.

Usar un mapper:

```txt
RawTradeRepublicTransaction
  -> mapTradeRepublicTransaction()
  -> DomainTransaction
```

Ejemplo de tipos:

```ts
type DomainTransaction =
  | CashTransferIn
  | CashTransferOut
  | InterestPayment
  | DividendPayment
  | BondCoupon
  | BondMaturity
  | InvestmentBuy
  | InvestmentSell
  | CardExpense
  | Fee
  | Tax
  | UnknownTransaction;
```

No forzar precisión total desde el día 1. Si un tipo de TR no se reconoce, guardar como `UnknownTransaction` y mostrarlo en una vista de revisión.

---

## Trade Republic CSV

Tipos esperados detectados / probables:

| TR `type` | Interpretación |
|---|---|
| `INTEREST_PAYMENT` | Rendimiento cash / intereses |
| `DIVIDEND` / `DIVIDEND_PAYMENT` | Rendimiento inversión |
| `BUY` | Compra de activo |
| `SELL` | Venta de activo |
| `FINAL_MATURITY` | Vencimiento de bono |
| `CUSTOMER_INBOUND` | Aportación externa |
| `CUSTOMER_OUTBOUND` | Retirada externa |
| `TRANSFER_*_INBOUND` | Entrada de cash |
| `TRANSFER_*_OUTBOUND` | Salida de cash |
| `BENEFITS_SAVEBACK` | Rendimiento / beneficio promocional |
| `CARD_TRANSACTION` | Gasto con tarjeta, guardar pero no central para V1 |
| `TAX` | Impuesto |
| `FEE` | Comisión |

El importador debe:

1. Parsear CSV.
2. Normalizar fechas.
3. Normalizar cantidades.
4. Detectar duplicados por transaction id.
5. Guardar raw transactions.
6. Generar resumen de importación:
   - nº filas importadas
   - nº duplicados ignorados
   - intereses
   - dividendos/cupones
   - compras
   - ventas
   - transferencias externas
   - gastos tarjeta
   - desconocidos

---

## Conceptos financieros del sistema

### Patrimonio financiero total

```txt
NetWorth =
  Caixa
+ TR Cash
+ TR Investment
+ MyInvestor Equity
+ MyInvestor FixedIncome
+ MyInvestor Crypto
```

No incluir vivienda.

Motivo: la vivienda enmascara los gráficos y no sirve para evaluar si la estrategia financiera/inversora va bien.

---

### Cash total

```txt
Cash =
  Caixa
+ TR Cash
```

---

### Inversión total

```txt
Invested =
  TR Investment
+ MyInvestor Equity
+ MyInvestor FixedIncome
+ MyInvestor Crypto
```

---

### Flujos externos MyInvestor

```txt
MyInvestorExternalFlow =
  myInvestorEquityFlow
+ myInvestorFixedIncomeFlow
+ myInvestorCryptoFlow
```

---

### Flujos externos Trade Republic

Deben venir del CSV de TR, no de entrada manual.

Ejemplo:

```txt
TRExternalFlow =
  CUSTOMER_INBOUND
- CUSTOMER_OUTBOUND
+/- otras transferencias clasificadas como externas
```

No confundir compras/ventas internas con flujos externos.

Comprar Tesla usando cash ya dentro de TR NO es una aportación externa.

---

## Gráfico principal: Star of the Show

La pantalla principal debe tener un gráfico de columnas apiladas mensuales.

Este gráfico es el elemento central de la aplicación.

NO debe ser una línea de patrimonio.
NO debe ser un pie chart.
NO debe ser una separación en dos barras, cash vs inversiones.
NO debe ser un gráfico de distribución de activos clásico.

Debe ser:

```txt
Una columna por mes.
La altura total de la columna = patrimonio financiero total.
La columna está apilada en 4 segmentos.
```

---

## Significado de los 4 segmentos

La barra combina dos ejes visuales:

| Eje | Codificación visual |
|---|---|
| Ubicación del dinero | Hue / color base |
| Origen económico del dinero | Tono claro/oscuro |

### Colores

| Segmento | Color conceptual | Significado |
|---|---|---|
| Cash from salary | Azul oscuro | Cash que procede del trabajo / ahorro / salario |
| Cash from yields | Azul claro | Cash que procede de intereses, cupones, bonos vencidos, dividendos cobrados o beneficios realizados que están en liquidez |
| Invested principal | Verde oscuro | Dinero invertido que procede de aportaciones del usuario |
| Invested growth | Verde claro | Beneficio acumulado de inversiones, revalorización, rendimiento no realizado o beneficio que sigue invertido |

Regla visual:

```txt
Azul = cash
Verde = invertido

Oscuro = capital aportado / salario / ahorro generado trabajando
Claro = rendimiento generado por el dinero
```

---

## Orden fijo del stack

El orden debe ser siempre el mismo, aunque algún segmento sea cero.

De abajo arriba:

```txt
1. Cash from salary        (azul oscuro)
2. Cash from yields        (azul claro)
3. Invested principal      (verde oscuro)
4. Invested growth         (verde claro)
```

Motivo: si el orden cambia mes a mes, la lectura visual se degrada.

---

## Interpretación del gráfico

La altura total responde:

```txt
¿Cuánto tenemos?
```

La proporción azul/verde responde:

```txt
¿Cuánto está líquido y cuánto está invertido?
```

La proporción oscuro/claro responde:

```txt
¿Cuánto viene de nuestro trabajo y cuánto ha generado el dinero?
```

El azul claro responde:

```txt
¿Cuánto rendimiento ya está convertido en cash?
```

El verde claro responde:

```txt
¿Cuánto crecimiento sigue dentro de las inversiones?
```

---

## Ejemplo visual conceptual

```txt
Patrimonio total del mes

┌──────────────────────────────┐
│ Verde claro                  │  Invested growth
├──────────────────────────────┤
│ Verde oscuro                 │  Invested principal
├──────────────────────────────┤
│ Azul claro                   │  Cash from yields
├──────────────────────────────┤
│ Azul oscuro                  │  Cash from salary
└──────────────────────────────┘
```

---

## Datos del gráfico

Modelo sugerido:

```ts
interface MonthlyOriginStack {
  periodEnd: string;

  cashFromSalary: number;
  cashFromYields: number;

  investedPrincipal: number;
  investedGrowth: number;

  totalNetWorth: number;
}
```

Invariante:

```txt
totalNetWorth =
  cashFromSalary
+ cashFromYields
+ investedPrincipal
+ investedGrowth
```

---

## Cálculo de los 4 segmentos

La implementación puede empezar con un modelo pragmático. No intentar resolver contabilidad perfecta desde el día 1.

Datos disponibles:

- Snapshots mensuales:
  - Caixa
  - TR Cash
  - TR Investment
  - MyInvestor asset values
  - MyInvestor asset flows
- CSV TR:
  - intereses
  - dividendos
  - cupones
  - vencimientos
  - compras
  - ventas
  - transferencias
  - gastos tarjeta
- Flujos manuales MyInvestor

### Principio general

El sistema necesita asignar el patrimonio actual a dos dimensiones:

1. Ubicación:
   - cash
   - invested

2. Origen:
   - principal/aportado/salario
   - yield/growth/rendimiento

Por tanto:

```txt
Cash = cashFromSalary + cashFromYields
Invested = investedPrincipal + investedGrowth
```

Y:

```txt
Principal = cashFromSalary + investedPrincipal
Growth = cashFromYields + investedGrowth
```

---

## Algoritmo inicial aceptable

Para una V1, usar una aproximación basada en acumulados.

### Principal acumulado

Capital aportado acumulado procedente del trabajo/ahorro.

```txt
principalAccumulated[N] =
  principalAccumulated[N-1]
+ externalFlowsToInvestments[N]
+ netIncreaseOfStrategicCash[N]
```

Pero cuidado: no complicar demasiado. En V1 puede introducirse un valor inicial manual de baseline.

### Growth acumulado

```txt
growthAccumulated =
  totalNetWorth
- principalAccumulated
```

Luego repartir growth entre cash e invested de forma pragmática:

- Cash yields detectados en TR CSV:
  - intereses
  - cupones
  - dividendos cobrados
  - vencimientos con beneficio si se puede determinar
- Lo que no esté explícitamente en cash yield puede permanecer como invested growth.

### CashFromYields

```txt
cashFromYields =
  cash yields acumulados
- cash yields reinvertidos explícitamente si se puede detectar
```

Si no se puede detectar reinversión con precisión, mantenerlo simple:

- CashFromYields = rendimiento cash acumulado detectado y actualmente disponible hasta el límite de Cash total.
- El resto del cash es CashFromSalary.

```txt
cashFromYields = min(totalCash, accumulatedDetectedCashYields)
cashFromSalary = totalCash - cashFromYields
```

### InvestedPrincipal e InvestedGrowth

```txt
investedPrincipal = min(totalInvested, principalAccumulated - cashFromSalary)
investedGrowth = totalInvested - investedPrincipal
```

Este modelo no es contabilidad perfecta FIFO, pero es suficientemente útil para la visualización mensual. Documentar en código que es un modelo de atribución, no una auditoría contable.

---

## Importante: no perseguir precisión contable perfecta

Este proyecto optimiza para:

```txt
Comprensión mensual
Bajo esfuerzo
Tendencia visual
Separación trabajo vs rendimiento
```

No optimiza para:

```txt
Fiscalidad exacta
FIFO exacto
Auditoría contable
Portfolio performance profesional
Presupuestos detallados de gastos
```

Trade Republic CSV se guarda entero para permitir mayor precisión futura.

---

## Vistas principales

### Dashboard

Debe mostrar:

1. Patrimonio financiero actual.
2. Variación desde mes anterior.
3. Gráfico principal de columnas apiladas.
4. Resumen del mes:
   - ahorro / aportación neta
   - rendimiento estimado
   - intereses/cupones/dividendos detectados
   - gastos TR tarjeta opcional
5. Distribución actual secundaria:
   - Cash
   - Renta Variable
   - Renta Fija
   - Cripto

---

### Monthly Wizard

Debe guiar al usuario.

Estados visuales:

```txt
✓ Caixa introducida
✓ TR CSV importado
✓ TR balances introducidos
✓ MyInvestor introducido
```

El usuario debe saber qué falta.

---

### Import Review

Después de importar CSV:

Mostrar:

| Métrica | Valor |
|---|---:|
| Filas leídas | n |
| Nuevas transacciones | n |
| Duplicados ignorados | n |
| Intereses | € |
| Dividendos/cupones | € |
| Compras | € |
| Ventas | € |
| Aportaciones externas | € |
| Retiradas externas | € |
| Gastos tarjeta | € |
| Desconocidos | n |

Permitir ver transacciones desconocidas.

---

## UI del gráfico principal

Requisitos:

- Una barra por mes.
- Barras apiladas.
- El eje Y es euros.
- Tooltip al pasar/clickar:
  - Total patrimonio
  - Cash from salary
  - Cash from yields
  - Invested principal
  - Invested growth
  - Variación vs mes anterior
- Click en una barra abre detalle mensual.
- Colores constantes en toda la app.
- La leyenda debe explicar claramente el significado de oscuro/claro.

Leyenda recomendada:

```txt
Azul = liquidez
Verde = invertido
Oscuro = aportado desde salario/ahorro
Claro = generado por rendimientos/inversión
```

---

## Nombres sugeridos en UI

Evitar términos demasiado contables.

Preferir:

| Concepto interno | Label UI |
|---|---|
| cashFromSalary | Cash aportado |
| cashFromYields | Cash generado |
| investedPrincipal | Invertido aportado |
| investedGrowth | Invertido generado |

Otra alternativa:

| Concepto interno | Label UI |
|---|---|
| cashFromSalary | Liquidez de ahorro |
| cashFromYields | Liquidez generada |
| investedPrincipal | Inversión aportada |
| investedGrowth | Inversión generada |

Mantener consistencia.

---

## Persistencia

Usar IndexedDB.

Tablas mínimas:

```txt
monthlySnapshots
rawTradeRepublicTransactions
importBatches
settings
```

### importBatches

```ts
interface ImportBatch {
  id: string;
  source: "TradeRepublic";
  fileName: string;
  importedAt: string;
  periodStart?: string;
  periodEnd?: string;
  rowCount: number;
  insertedCount: number;
  duplicateCount: number;
  unknownCount: number;
}
```

---

## Settings

Necesitamos al menos:

```ts
interface Settings {
  initialPrincipal?: number;
  initialCashFromSalary?: number;
  initialCashFromYields?: number;
  initialInvestedPrincipal?: number;
  initialInvestedGrowth?: number;
  preferredMonthlyCutoffDay: number; // 4
}
```

El usuario puede tener histórico anterior. La V1 debe permitir configurar un baseline inicial para que los cálculos no empiecen artificialmente desde cero.

---

## Restricciones explícitas para Codex

No construir:

- login
- backend servidor
- multiusuario
- fiscalidad
- presupuesto familiar detallado
- scraping bancario
- sincronización cloud
- integración con APIs bancarias
- edición manual movimiento a movimiento como flujo principal

Sí construir:

- app local-first
- wizard mensual
- importador CSV TR
- snapshots mensuales
- modelo de dominio
- dashboard con stacked bar chart
- persistencia IndexedDB
- base preparada para ampliar gastos en el futuro

---

## Criterios de éxito de V1

La V1 es exitosa si permite:

1. Crear un snapshot mensual.
2. Importar un CSV de Trade Republic.
3. Guardar todos los movimientos importados.
4. Ver un resumen del import.
5. Introducir Caixa, TR Cash, TR Investment y MyInvestor por clase.
6. Ver el gráfico principal mensual con los 4 segmentos.
7. Clickar en un mes y ver el desglose.
8. No introducir movimientos manualmente uno a uno.

---

## Filosofía del producto

Este sistema existe porque una simple línea de patrimonio no explica la causa del crecimiento.

La idea central es:

```txt
No basta con saber que tenemos más.
Queremos saber si tenemos más porque hemos ahorrado más o porque el dinero ha trabajado.
```

El gráfico principal debe hacer visible esa diferencia.
