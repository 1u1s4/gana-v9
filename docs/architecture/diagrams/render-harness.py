"""Render estático y reproducible: python3 docs/architecture/diagrams/render-harness.py"""
from pathlib import Path
from html import escape as e
import json

HERE = Path(__file__).resolve().parent
DATA = json.loads((HERE / 'harness-content.json').read_text())
# Paleta editorial de diagram-design, elegida explícitamente por el usuario.
PAPER, INK, MUTED, ACCENT, LINK = '#f5f5f5', '#2d3142', '#4f5d75', '#eb6c36', '#2e5aa8'

def text(x, y, value, cls='name'):
    return f'<text x="{x}" y="{y}" class="{cls}">{e(value)}</text>'

def path(points):
    """Polyline ortogonal con esquinas de radio 8, sin rutas automáticas."""
    out = f'M {points[0][0]},{points[0][1]}'
    for i, p in enumerate(points[1:-1], 1):
        before, after = points[i-1], points[i+1]
        def offset(q):
            dx, dy = q[0]-p[0], q[1]-p[1]
            n = abs(dx) + abs(dy)
            return p[0]+dx/n*8, p[1]+dy/n*8
        a, b = offset(before), offset(after)
        out += f' L {a[0]:g},{a[1]:g} Q {p[0]},{p[1]} {b[0]:g},{b[1]:g}'
    return out + f' L {points[-1][0]},{points[-1][1]}'

def arrow(slug, points, label=None, at=None, dashed=False, external=False):
    color = LINK if external else MUTED
    dash = ' stroke-dasharray="5 4"' if dashed else ''
    out = f'<path class="connector" d="{path(points)}" fill="none" stroke="{color}" stroke-width="1.5"{dash} marker-end="url(#{slug}-arrow{"-link" if external else ""})"/>'
    if label:
        x,y=at
        w=len(label)*7.4+16
        out+=f'<rect class="label-mask" x="{x-w/2}" y="{y-14}" width="{w}" height="20" fill="{PAPER}"/>'
        out+=f'<text x="{x}" y="{y}" class="edge-label" text-anchor="middle">{e(label)}</text>'
    return out

def node(item, pos):
    name, desc, technical, kind = item
    x,y,w,h=pos
    tag={'normal':'COMPONENTE','focal':'NÚCLEO','store':'PERSISTENCIA','external':'EXTERNO','optional':'CONDICIONAL'}[kind]
    stroke=ACCENT if kind=='focal' else LINK if kind=='external' else MUTED
    fill='#f9e9e2' if kind=='focal' else '#ececec' if kind=='store' else PAPER
    dashed=' stroke-dasharray="5 4"' if kind=='optional' else ''
    out=f'<g class="node" data-kind="{kind}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{fill}" stroke="{stroke}" stroke-width="1.2"{dashed}/>'
    out+=text(x+16,y+20,tag,'tag')+text(x+16,y+46,name)
    # Technical strings wrap at separators, preserving all text.
    out+=text(x+16,y+68,desc,'detail')
    chunks=[]
    while len(technical)>int((w-32)/7.2):
        limit=int((w-32)/7.2)
        cut=max(technical.rfind(' ',0,limit),technical.rfind('/',0,limit))
        if cut<8: cut=limit
        chunks.append(technical[:cut])
        technical=technical[cut:].lstrip()
    chunks.append(technical)
    for i,chunk in enumerate(chunks): out+=text(x+16,y+92+i*16,chunk,'technical')
    return out+'</g>'

GRID=[(40,80,320,128),(480,80,320,128),(920,80,320,128),(920,280,320,128),(480,280,320,128),(40,280,320,128),(40,480,320,128),(480,480,320,128),(920,480,320,128)]

def diagram(s):
    slug='harness-'+s['id']
    defs=''.join(f'<marker id="{slug}-arrow{suffix}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="{color}"/></marker>' for suffix,color in [('',MUTED),('-accent',ACCENT),('-link',LINK)])
    out=f'<div class="diagram-container" tabindex="0" aria-label="Diagrama desplazable: {e(s["title"])}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-labelledby="{slug}-title {slug}-desc"><title id="{slug}-title">{e(s["title"])}</title><desc id="{slug}-desc">{e(s["intro"])}</desc><defs>{defs}</defs><rect width="1280" height="720" fill="{PAPER}"/>'
    edges=[]
    def a(points, label=None, at=None, **kwargs): edges.append(arrow(slug,points,label,at,**kwargs))
    if s['id']=='mapa':
        positions=[GRID[0],GRID[5],GRID[4],GRID[1],GRID[2],GRID[3],GRID[7],GRID[8]]
        a([(360,144),(480,144)],'RUN',(420,130))
        a([(360,344),(480,344)])
        a([(584,280),(584,208)],'EJECUTA',(632,250))
        a([(696,208),(696,280)],'RESULTADO',(752,250))
        a([(920,144),(800,144)],external=True)
        a([(800,344),(920,344)])
        a([(640,408),(640,480)])
        a([(1080,408),(1080,480)])
        a([(920,544),(800,544)],'LINEAGE',(860,530))
    elif s['id'] in ['pipeline','daily']:
        positions=GRID[:len(s['nodes'])]
        for i,j in [(0,1),(1,2),(2,3),(3,4),(4,5)]:
            x,y,w,h=positions[i]; X,Y,W,H=positions[j]
            if y==Y: a([(x+w if X>x else x,y+h/2),(X if X>x else X+W,Y+H/2)])
            else: a([(x+w/2,y+h),(X+W/2,Y)])
        if s['id']=='pipeline':
            a([(200,408),(200,480)],dashed=True)
            a([(360,544),(480,544)],dashed=True)
            a([(800,544),(920,544)])
        else:
            a([(144,408),(144,448),(200,448),(200,480)])
            a([(256,408),(256,432),(640,432),(640,480)],'SIN OFICIALES',(488,454),dashed=True)
    elif s['id']=='entrega':
        positions=[(40,96,240,144),(360,96,240,144),(680,96,240,144),(1000,96,240,144),(1000,448,240,144),(40,448,240,144),(680,448,240,144),(360,448,240,144)]
        for x,X in [(280,360),(600,680),(920,1000)]: a([(x,168),(X,168)])
        a([(1160,240),(1160,448)],'CONFIRMADO',(1096,420))
        a([(480,240),(480,288),(160,288),(160,448)],'FALLO SEGURO',(288,274),dashed=True)
        a([(800,240),(800,336),(480,336),(480,448)],'NO PRE-MATCH',(640,322),dashed=True)
        a([(1080,240),(1080,384),(800,384),(800,448)],'INCIERTO',(940,370),dashed=True)
    else:
        positions=[GRID[0],GRID[2],GRID[1],GRID[4],GRID[5],GRID[6],GRID[3],GRID[8]]
        a([(360,144),(480,144)])
        a([(920,144),(800,144)],external=True)
        a([(640,208),(640,280)])
        a([(480,344),(360,344)])
        a([(200,408),(200,480)])
        a([(800,344),(920,344)])
        a([(1080,408),(1080,480)],dashed=True)
    out+=''.join(edges)
    out+=''.join(node(item,pos) for item,pos in zip(s['nodes'],positions))
    out+=f'<line x1="40" y1="652" x2="1240" y2="652" stroke="#bfc0c0"/>'
    used={n[3] for n in s['nodes']}
    keys=[('normal','Componente'),('focal','Núcleo'),('store','Estado / evidencia'),('external','Fuente externa'),('optional','Ruta condicional')]
    x=40
    for kind,label in keys:
        if kind not in used: continue
        stroke=ACCENT if kind=='focal' else LINK if kind=='external' else MUTED
        fill='#ececec' if kind=='store' else '#f9e9e2' if kind=='focal' else PAPER
        dash=' stroke-dasharray="4 3"' if kind=='optional' else ''
        out+=f'<rect x="{x}" y="676" width="16" height="12" rx="2" fill="{fill}" stroke="{stroke}"{dash}/>'+text(x+24,686,label,'legend')
        x+=220
    return out+'</svg></div>'

style='''
:root{--paper:#f5f5f5;--ink:#2d3142;--muted:#4f5d75;--accent:#eb6c36;--line:#bfc0c0;--sans:'Geist',system-ui,sans-serif;--serif:'Instrument Serif',Georgia,serif;--mono:'Geist Mono',monospace}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.65}main{max-width:1376px;margin:auto;padding:56px 40px 80px;min-width:0}header{border-top:3px solid var(--ink);padding-top:28px}.eyebrow,.meta,.index{font:11px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}h1{font:400 clamp(42px,5vw,76px)/1.06 var(--serif);letter-spacing:-.025em;max-width:900px;margin:24px 0}.lead{font-size:20px;max-width:820px}.scope{max-width:900px;color:var(--muted);font-size:14px}nav{display:flex;gap:8px 24px;flex-wrap:wrap;padding:24px 0;border-block:1px solid var(--line);margin-top:32px}a{color:var(--ink);text-underline-offset:4px}nav a{font-size:13px}a:hover{color:#a8461c}section{padding-top:56px;scroll-margin-top:20px}h2{font:400 36px/1.2 var(--serif);margin:0 0 18px}section>p{max-width:950px;color:var(--muted)}.diagram-container{width:100%;overflow-x:auto;max-width:100%;min-width:0}svg{width:100%;min-width:1280px;display:block}.name{font:600 16px var(--sans);fill:var(--ink)}.detail{font:400 11px var(--sans);fill:var(--muted)}.technical{font:400 12px var(--mono);fill:var(--muted)}.tag{font:500 8px var(--mono);letter-spacing:.1em;fill:var(--muted)}.edge-label{font:400 12px var(--mono);fill:var(--muted)}.legend{font:400 11px var(--sans);fill:var(--muted)}.notes{display:grid;grid-template-columns:1.2fr 1fr;gap:0 40px;border-top:1px solid var(--line)}.notes p{font-size:14px;margin:20px 0 0}.notes p:first-child{border-left:3px solid var(--accent);padding-left:16px}details{margin-top:24px;padding:16px 0;border-block:1px solid #d8d9dd}summary{cursor:pointer;font-size:13px;color:var(--muted)}.sources{display:flex;flex-wrap:wrap;gap:10px 20px;margin-top:16px}.sources a,code{font:12px var(--mono);overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:14px;margin:24px 0}th,td{padding:16px;text-align:left;vertical-align:top;border-bottom:1px solid #d8d9dd}th{font-size:12px;text-transform:uppercase;letter-spacing:.04em}th:first-child,td:first-child{width:22%}footer{border-top:2px solid var(--ink);margin-top:60px;padding-top:20px;font-size:12px;color:var(--muted)}.callout{font:italic 28px/1.35 var(--serif);margin:32px 0;max-width:780px}.table-wrap{overflow-x:auto}@media(max-width:700px){main{padding:28px 16px}.notes{grid-template-columns:1fr}h2{font-size:30px}.lead{font-size:18px}th,td{padding:12px 8px}nav{gap:12px 20px}}@media print{main{padding:0}nav{display:none}.diagram-container{overflow-x:visible}svg{min-width:0}section{break-before:page;padding-top:12px}details{display:block}.notes{display:block}a{color:inherit}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
'''
font='https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&amp;family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;display=swap'
html=f'<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{e(DATA["title"])}</title><link rel="stylesheet" href="{font}"><style>{style}</style></head><body><main>'
html+=f'<header><div class="eyebrow">Gana v9 / Arquitectura del harness / 08 octubre 2026</div><h1>De un partido a una decisión auditable</h1><p class="lead">Cómo funciona el harness de Gana v9: datos, investigación, predicciones, publicación y feedback en un solo mapa de lectura.</p><p class="scope">{e(DATA["scope"])}</p><p class="meta">Checkout {e(DATA["revision"])} · America/Guatemala · Diagram Design / editorial light</p></header>'
html+='<nav aria-label="Contenido">'+''.join(f'<a href="#{s["id"]}">{e(s["title"].split(" · ")[0])} {e(label)}</a>' for s,label in zip(DATA['sections'],['Mapa general','Pipeline','Daily E2E','Publicación','Feedback']))+'<a href="#operacion">06 Operación y controles</a></nav>'
for s in DATA['sections']:
    html+=f'<section id="{s["id"]}"><h2>{e(s["title"])}</h2><p>{e(s["intro"])}</p>'+diagram(s)
    html+='<div class="notes">'+''.join(f'<p>{e(n)}</p>' for n in s['notes'])+'</div>'
    html+='<details><summary>Ver fuentes de implementación</summary><div class="sources">'+''.join(f'<a href="../../../{e(p)}">{e(p)}</a>' for p in s['sources'])+'</div></details></section>'
html+='''<section id="operacion"><h2>06 · Qué sostiene el flujo</h2><p>Los tres niveles de estado son distintos: tarea durable, veredicto analítico y entrega externa. Un proceso terminado no garantiza un pick aprobado ni un mensaje entregado.</p>
<div class="table-wrap"><table><thead><tr><th>Estado</th><th>Qué responde</th><th>Valores o evidencia</th></tr></thead><tbody>
<tr><td>Tarea / run</td><td>¿Se ejecutó el trabajo técnico?</td><td>HarnessTask, attempts, lease, checkpoints; queued / running / succeeded / failed / blocked</td></tr>
<tr><td>Veredicto</td><td>¿La evidencia y el mercado permiten promover el resultado?</td><td>promotable / review-required / blocked, con razones</td></tr>
<tr><td>Publicación</td><td>¿Qué recibió el canal y a qué batch pertenece?</td><td>Lock por fecha + ledger + hashes + message IDs; published / review-delivered / retryable / incertidumbre</td></tr>
</tbody></table></div>
<h2>Una sola autoridad de scheduling</h2><p>La documentación operativa designa Hermes cron; Codex Scheduled, crontab y launchd son fallbacks mutuamente excluyentes. El dispatcher usa America/Guatemala, pausa de mantenimiento y lock global; inicia como máximo un flujo agent-heavy por checkpoint.</p>
<table><thead><tr><th>Hora Guatemala</th><th>Trabajo previsto por el repositorio</th></tr></thead><tbody>
<tr><td>07:15</td><td>Retención; validación y métricas de ayer. Recuperación del Daily de hoy si quedó retryable vencido tras el cambio de fecha, dentro de 07:15–10:15.</td></tr>
<tr><td>10:15</td><td>Daily inicial para mañana: Codex, gpt-5.6-sol, high, fast desactivado, web live, portfolio-v2 y ligas auto.</td></tr>
<tr><td>13:15</td><td>Primero un Daily inicial nunca intentado; luego strategy review antes que un Daily meramente retryable.</td></tr>
<tr><td>18:15 / 22:15</td><td>Reintento del slate de mañana sólo con lock retryable y retryAfter vencido. No fuerza estados terminales.</td></tr>
</tbody></table>
<h2>Persistencia y controles por superficie</h2>
<table><thead><tr><th>Superficie</th><th>Responsabilidad y límite</th></tr></thead><tbody>
<tr><td>Base de datos</td><td>Prisma sobre PostgreSQL/Supabase. Catálogo deportivo, snapshots/quotes, runs/tasks, research/claims, predictions/parlays, validaciones, ledger y métricas. Pooler de sesión para el runtime, no de transacciones.</td></tr>
<tr><td>Artifacts locales</td><td>runId y dailyBatchId enlazan JSON, evidence pack, handoff, manifests y trazas. .artifacts/ y .sessions/ son salidas locales ignoradas por Git. Snapshots por hash permiten deduplicación y trazabilidad.</td></tr>
<tr><td>Agente Codex</td><td>Subproceso codex exec, salida estructurada, web search y sandbox configurable; timeout/abort y control del proceso. El default cron documentado es danger-full-access: no equivale a aislamiento fuerte. Los wrappers de herramientas de OpenRouter no interceptan cada herramienta nativa de Codex.</td></tr>
<tr><td>Agente OpenRouter</td><td>Tool registry con evaluación allow / require_approval / block, controles de filesystem/egress, auditoría, redacción y límites de pasos/coste. Browser Use es opcional y configurable.</td></tr>
<tr><td>Reglas comunes</td><td>Bloqueo de acciones monetarias en el harness, validación de contratos y gates de evidencia/mercado. Logs, errores, auditoría y artifacts aplican redacción; las credenciales no forman parte del diagrama.</td></tr>
<tr><td>Lectura y mantenimiento</td><td>Dashboard local de resultados persistidos; analytics incluye leaderboard, Brier, logloss y CLV. La retención mantiene ventanas y cierre referencial del linaje publicado; el comando de retención es dry-run salvo apply explícito o wrapper operativo habilitado.</td></tr>
</tbody></table>
<p class="callout">La unidad de confianza es una decisión con evidencia, un batch identificable y una entrega verificable.</p>
<details><summary>Fuentes de operación, datos y seguridad</summary><div class="sources">
<a href="../../daily-operations-cron.md">docs/daily-operations-cron.md</a><a href="../system-architecture.md">system-architecture.md</a><a href="../../../src/agent.ts">src/agent.ts</a><a href="../../../src/tools/index.ts">src/tools/index.ts</a><a href="../../../src/permissions/policy.ts">src/permissions/policy.ts</a><a href="../../../src/security/no-monetary-actions.ts">src/security/no-monetary-actions.ts</a><a href="../../../prisma/schema.prisma">prisma/schema.prisma</a><a href="../../../src/analytics/leaderboard.ts">src/analytics/leaderboard.ts</a>
</div></details></section>
<footer>Vista estática y autocontenida, con SVG accesibles y sin JavaScript. Fuentes: Instrument Serif, Geist y Geist Mono vía Google Fonts; sin conexión se usan las alternativas locales declaradas. Los diagramas usan lienzos 1280 × 720 y desplazamiento horizontal en pantallas pequeñas. Las rutas de código se abren desde el checkout.<br>Contenido: harness-content.json · Regeneración: python3 docs/architecture/diagrams/render-harness.py · Estilo de la skill diagram-design 2.6, elegido por el usuario.</footer>
</main></body></html>'''
(HERE / 'harness-actual.html').write_text(html)
print(HERE / 'harness-actual.html')
