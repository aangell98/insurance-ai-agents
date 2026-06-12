# Guión demo — Insurance AI Agents

> Tono: cercano, honesto y comercial sin pasarte. La idea no es impresionar a un manager técnico, sino enseñarle a un cliente potencial qué problema le resuelve el sistema y por qué merece una PoC con sus datos.

**Tiempo total: 8 minutos.**

**Producto:** plataforma multi-agente para procesamiento de siniestros. Tres agentes IA — intake, risk y compliance — evalúan partes en segundos, con gobernanza, persistencia en Cosmos, login con Entra ID y despliegue en Azure.

---

## 0. Antes de empezar (preparación, 1 min antes)

Tener abiertas estas pestañas, **en este orden**:

1. `http://localhost:5173` — dashboard. Haz **logout antes** para que el login se vea en directo.
2. Portal Azure → Resource Group `rg-insurance-ai-demo` → Cosmos `ins-ai-demo-cosmos-jii435hjlwyyc` → **Data Explorer**.
3. Portal Azure → mismo RG → APIM `ins-ai-demo-apim-jii435hjlwyyc`.
4. `https://github.com/aangell98/insurance-ai-agents/pull/2` + pestaña **Checks**.
5. (Opcional) `https://learn.microsoft.com/en-us/agent-framework/overview/agent-framework-overview` por si preguntan por Microsoft Agent Framework.

Checklist rápida:

- Backend corriendo en `uvicorn` por `:8000`.
- Frontend corriendo en Vite por `:5173`.
- `.env` con `USE_MAF_ORCHESTRATOR=true`.
- Si tu usuario tiene ambos roles, dejar preparado el cambio **Cliente / Operario** para usarlo en vivo.

> Truco: deja cargada la app en el login para que la primera impresión sea “esto entra con identidad real”, no una demo abierta.

---

## 1. Apertura (1 min) — dolor del cliente, no producto

**Mostrar:** pantalla de login en `http://localhost:5173`.

> *"Antes de enseñarte qué he construido, déjame ponerlo en contexto. Hoy en día procesar un parte de siniestro lleva de 30 a 45 minutos a un analista humano. En ese tiempo se cometen errores, se cuelan fraudes y, lo peor, no hay un rastro claro de por qué se aprobó o rechazó cada decisión. Cuando viene auditoría o regulador, te toca reconstruirlo a mano."*

> *"La pregunta no es si la IA puede leer un PDF. La pregunta es: ¿cómo conseguimos procesar mucho más rápido sin perder trazabilidad ni la capacidad de meter a un humano cuando el caso lo requiere?"*

> *"Eso es exactamente lo que vamos a ver."*

1. Click en **Iniciar sesión con Microsoft Entra**.
2. Una vez dentro, si tienes ambos roles, cambia a **Operario**.

> *"No me paro aquí más tiempo: solo quería que vieras que el acceso es real y que la vista cambia según el rol."*

---

## 2. La Hero Landing (1 min) — “esto es lo que conseguirás”

**Mostrar:** tab **Inicio**.

Deja que los contadores animados terminen de subir y señala, sin correr:

- **€ procesados YTD**
- **% automatización**
- **minutos ahorrados**
- **fraudes detectados**

> *"Estos cuatro números son lo que le importa al negocio: cuánto procesa, cuánto automatiza, cuánto tiempo ahorra y cuántos fraudes detecta. Y no es un slide bonito: esto es lo que vemos en la métrica, calculado desde los datos que ya están guardados."*

Señalar después:

- La comparativa **Antes: 45 min / Ahora: 30 s**
- El timeline visual del flujo
- Los badges **Microsoft Agent Framework + Azure OpenAI + Entra ID + Cosmos DB + APIM**
- El CTA principal

> *"Aquí abajo ves el flujo en cinco pasos. Tres agentes IA, una decisión final y, cuando toca, revisión humana. Es justo lo que vamos a lanzar ahora en vivo."*

> *"Y estos badges no están para decorar: te sitúan la stack. No es código suelto en mi portátil; está montado sobre servicios de Microsoft pensados para llevar esto a producción."*

---

## 3. Demo automática (2 min) — “míralo en acción”

**Mostrar:** botón **▶ Demo automática** del header.

> *"En vez de procesar un único caso manualmente, voy a lanzar los cinco que ya tengo preparados. Así ves el comportamiento del sistema en escenarios distintos sin que yo tenga que ir guiándolo clic a clic."*

1. Pulsar **▶ Demo automática**.
2. Dejar que se abra el modal full-screen.
3. Mientras corre, hablar mirando el feed y los contadores acumulados.

### Caso 1 — `low_risk`

> *"Aprobado automáticamente en segundos. Esto es el grueso del volumen: importes bajos, documentación razonable y sin señales de alarma. Si automatizas este tramo, liberas al equipo para lo que sí requiere criterio humano."*

### Caso 2 — `high_amount`

> *"Aquí entra una regla de negocio clara: por encima de **20.000 €**, el sistema no liquida solo. Lo marca para revisión humana aunque todo lo demás parezca correcto. Eso es justo el tipo de control que tranquiliza a negocio y a compliance."*

### Caso 3 — `human_review` (Tesla)

> *"Este es el caso que mejor vende la idea de human-in-the-loop. La IA no sustituye al responsable: le deja preparado el dossier, la evidencia y una propuesta de decisión. El humano pasa de invertir 45 minutos a validar en unos segundos."*

### Caso 4 — `fraudulent`

> *"Detección automática de fraude. El sistema lo rechaza y lo manda a la cola de investigación. Aquí el valor no es solo ahorrar tiempo: es evitar pagar un siniestro que no toca."*

### Caso 5 — `prompt_injection`

> *"Y este es especialmente útil para enseñar control. Hay un intento de manipular el sistema con instrucciones falsas escondidas en la descripción. Lo paramos con un guard determinista, **regex puro**, antes de que llegue al modelo. No dependemos solo de que la IA ‘se porte bien’."*

### Pantalla final del modal

Cuando salga el resumen, remátalo así:

> *"Cinco casos en unos segundos. Manualmente serían 3 horas y 45 minutos. Aquí ya ves automatización, ahorro y fraude detectado con números delante. La pregunta es: ¿qué parte de esto quieres seguir haciendo a mano?"*

---

## 4. Un caso en vivo (1 min) — “y si quieres más detalle”

**Mostrar:** cerrar el modal → ir a tab **Cliente** → escenario **🟠 Revisión Humana**.

1. Lanzar el caso del Tesla de **32.000 €**.
2. Mientras corre, enseñar el progreso agente por agente.

> *"Aquí ya no estás viendo solo el resultado final. Ves cómo cada agente aporta una pieza: extracción de datos, valoración de riesgo y justificación de cumplimiento. Si el streaming está visible, mejor todavía, porque se ve que no es texto fijo sino generación real en tiempo de ejecución."*

3. Al terminar, abrir el audit trail completo.
4. Señalar:
   - timestamps
   - duraciones
   - decisión de cada agente
   - justificación final de revisión humana

> *"La clave de venta aquí no es que la IA decida sola. Es que prepara todo el trabajo previo y deja al compliance officer la última palabra cuando el caso lo exige."*

---

## 5. Gobernanza visible (1.5 min) — “y cómo lo controlamos”

### 5.1 Estadísticas

**Mostrar:** tab **Estadísticas**.

Señalar la primera fila de métricas de negocio:

- **Ahorro estimado este mes**
- **Tiempo medio reducido vs 45 min**
- **Tasa de automatización**
- **Fraudes evitados**

> *"Esto lo entiende un director financiero en diez segundos. Hay ahorro económico, reducción de tiempo y control de fraude. Y si pasas el ratón por cada métrica, ves la fórmula; otra vez, no es marketing, es cómo lo estamos calculando."*

Menciona rápido los gráficos:

> *"El donut te enseña cómo se reparten las decisiones y la barra de siete días te deja ver tendencia. Lo técnico está, pero plegado, porque la conversación con cliente debe empezar por impacto de negocio."*

### 5.2 Gobernanza + Eval Gate

**Mostrar:** tab **Gobernanza** y después el PR **#2** en GitHub con **Checks**.

> *"Cada cambio al sistema pasa por un gate de calidad. Cuando mi equipo sube una modificación, se lanzan casos de validación automáticamente. Si la calidad baja, el cambio no entra."*

Señalar el check verde y el resultado **4/4**.

> *"Esto le da a cliente y regulador algo muy importante: el modelo no se degrada en silencio."*

### 5.3 Cosmos DB

**Mostrar:** Portal Azure → Cosmos → **Data Explorer**.

> *"Aquí está cada siniestro procesado. No se pierde nada al reiniciar la app, no dependes de claves sueltas y cada caso queda recuperable con su resultado y su trazabilidad. Si mañana te piden revisar un expediente concreto, está aquí."*

### 5.4 APIM

**Mostrar:** Portal Azure → APIM.

> *"Y todas las llamadas al modelo pasan por un gateway donde aplicamos content safety, límites de tokens y auditoría. Además, cada agente tiene su propia suscripción, así que puedes controlar costes y aislar comportamientos por agente."*

---

## 6. Microsoft Agent Framework (30 s) — el argumento técnico-comercial

> *"Una última pieza importante: esto no está orquestado con pegamento casero. Está montado sobre Microsoft Agent Framework, el SDK oficial de Microsoft para sistemas multiagente. ¿Por qué importa? Porque te deja cambiar de modelo, añadir un cuarto agente o meter revisión humana sin rehacer toda la arquitectura. Y además ya viene preparado para observabilidad, trazas y evaluación, que es justo lo que necesitas cuando esto deja de ser una demo y pasa a tocar procesos reales."*

Si preguntan más, usa la pestaña opcional de documentación, pero no abras esa derivada salvo que te la pidan.

---

## 7. Cierre (1 min) — “¿qué hacemos ahora?”

> *"Lo que hemos visto es una demo, pero la arquitectura de debajo es la misma que usarías en producción. Lo que cambiaría para una PoC real es bastante concreto: integrar con tu sistema de pólizas, sustituir datos mock por tus siniestros históricos y ajustar el dataset de evaluación con tus casos reales."*

> *"Estimación honesta: una PoC con tus 100 últimos siniestros, para medir automatización, tiempos y fraude potencial, es trabajo de dos o tres semanas. A partir de ahí ya decides si quieres escalarlo. Y el coste también queda gobernado: el modelo se factura por uso y el gateway nos deja poner cuotas por agente para que no haya sorpresas. Si te interesa, la siguiente conversación no es sobre slides; es sobre cuándo probamos esto con tus datos."*

---

## Anexo — preguntas técnicas frecuentes

| Pregunta | Respuesta |
|---|---|
| ¿Cómo se mide el “tiempo ahorrado” exactamente? | "45 min manual menos el tiempo real del pipeline. Lo ves en Estadísticas y cada métrica tiene tooltip con la fórmula." |
| ¿Qué es Microsoft Agent Framework? | "El SDK oficial de Microsoft para multi-agent. Unifica el trabajo previo de Semantic Kernel y AutoGen, está en GA y la documentación está en learn.microsoft.com/agent-framework." |
| ¿Y si baja la calidad del modelo? | "El eval gate lo detecta y bloquea el merge. En la demo se ve el check verde en GitHub Actions con 4/4 casos pasados." |
| ¿Quién aprueba los siniestros marcados como revisión humana? | "El compliance officer. La idea es que ese sea solo el porcentaje de casos donde realmente aporta criterio humano." |
| ¿Es seguro frente a prompt injection? | "Dos capas: el agente puede detectarlo y, por encima, hay un filtro de regex determinista en el orquestador. El caso 5 del autoplay lo enseña en vivo." |
| ¿Cómo escala? | "El orquestador puede evolucionar con checkpointing y desplegarse como Azure Durable Function. Para esta demo corre como FastAPI normal." |
| ¿Y si quiero on-premise o no nube? | "La lógica de negocio queda desacoplada del modelo. MAF soporta swap de provider — por ejemplo Anthropic, Ollama, Gemini o Bedrock — sin tocar la lógica de negocio." |
| ¿Coste por caso? | "Depende del modelo. Con GPT-4o y cuatro prompts por caso, el orden de magnitud es ~0,005 € por siniestro procesado." |
| ¿Dónde se guarda cada decisión? | "En Cosmos DB, con persistencia por caso y trazabilidad completa para recuperar expedientes después." |
| ¿Cómo se controla quién ve qué? | "Con Entra ID y roles. Un cliente no ve la consola del operador y el operador sí puede entrar en revisión, estadísticas y gobernanza." |
| ¿Qué aporta APIM además de seguridad? | "Control de consumo, auditoría y separación por agente. Es útil tanto para costes como para gobernanza." |
| ¿Por qué APIM y no llamar directo al modelo? | "Porque centraliza seguridad, límites de uso, auditoría y control por agente en un único punto." |
| ¿Por qué Cosmos DB y no SQL? | "Porque el expediente es naturalmente JSON y el acceso típico es por cliente y por siniestro. Encaja bien para este tipo de trazabilidad." |
| ¿Hay claves en código para Cosmos o para el acceso al modelo? | "No. La demo está planteada para trabajar con identidad gestionada y acceso corporativo, no con secretos repartidos por el código." |
| ¿Qué pasa si entra un usuario sin rol? | "No ve la experiencia operativa y los endpoints protegidos no le dejan avanzar. No es solo una restricción visual." |
| ¿Un cliente puede ver siniestros de otro cliente? | "No. La idea es que cada cliente quede aislado por identidad y permisos; el operador sí tiene la vista transversal." |
| ¿Por qué solo 4 casos en el eval gate? | "Porque es el punto de partida. La lógica correcta es ir ampliando el set con casos reales a medida que el sistema madura." |
| ¿Qué habría que hacer para una PoC real? | "Conectar el sistema a pólizas y siniestros reales, cargar histórico para evaluación y acordar las reglas de revisión humana con negocio y compliance." |

---

## Cosas que **NO** mencionar

- No digas **Semantic Kernel** salvo que te pregunten. En el cuerpo principal di simplemente **Microsoft Agent Framework**.
- No entres en detalles de Entra como `accessTokenAcceptedVersion=2`, claims concretos o gotchas del registro de aplicación.
- Si sale el tema seguridad, queda mejor decir: **“Entra ID con managed identities, sin claves en código”** y seguir.
- No menciones bugs que salieron durante el desarrollo.
- No conviertas la demo en una clase de Azure. Si preguntan por YAML, Bicep, roles o políticas exactas, eso va al anexo o a una conversación aparte.
- No uses palabras como *zero trust*, *SOC2*, *NIST*, *OWASP*, *defense in depth* o similares si nadie las ha traído antes.
- No abras la discusión de costes profundos si no te la piden; da orden de magnitud y vuelve al ahorro de tiempo y fraude evitado.
- No vendas “autonomía total”. El mensaje correcto es **automatización con control humano cuando importa**.

Si te empujan a un nivel demasiado técnico, puedes salir así:

> *"La parte importante para esta conversación es el impacto en operación y trazabilidad. Si quieres, luego entramos al detalle técnico con calma."*
