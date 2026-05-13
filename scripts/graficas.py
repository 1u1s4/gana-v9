import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# Data
dia_data = [
    ['2026-05-11', 7, 0, 7, 0, 0, 2.020, 0.5417, 0.0],
    ['2026-05-11/12', 1, 1, 0, 0, 0, 3.712, 0.8581, 100.0],
    ['2026-05-12', 53, 34, 18, 1, 0, 2.301, 0.6489, 65.4],
    ['2026-05-13', 21, 0, 0, 0, 21, 1.826, 0.6489, None]
]
dia_cols = ['Fecha', 'Parlays', 'Won', 'Lost', 'Voided', 'Sin_validar', 'Cuota_prom', 'Conf_prom', 'Hit_rate']
df_dia = pd.DataFrame(dia_data, columns=dia_cols)

cuota_data = [
    ['<1.50', 23, 13, 3, 0, 7, 0.7675, 81.3],
    ['1.50-1.99', 15, 6, 3, 0, 6, 0.6390, 66.7],
    ['2.00-2.99', 29, 7, 14, 0, 8, 0.5948, 33.3],
    ['3.00-4.99', 15, 9, 5, 1, 0, 0.5453, 64.3]
]
cuota_cols = ['Rango', 'Parlays', 'Won', 'Lost', 'Voided', 'Sin_validar', 'Conf_prom', 'Hit_rate']
df_cuota = pd.DataFrame(cuota_data, columns=cuota_cols)

conf_data = [
    ['<0.50', 8, 3, 4, 1, 0, 3.215, 42.9],
    ['0.50-0.64', 36, 10, 15, 0, 11, 2.470, 40.0],
    ['0.65-0.74', 21, 10, 4, 0, 7, 1.829, 71.4],
    ['0.75-0.84', 15, 10, 2, 0, 3, 1.343, 83.3],
    ['>=0.85', 2, 2, 0, 0, 0, 2.488, 100.0]
]
conf_cols = ['Confianza', 'Parlays', 'Won', 'Lost', 'Voided', 'Sin_validar', 'Cuota_prom', 'Hit_rate']
df_conf = pd.DataFrame(conf_data, columns=conf_cols)

perfil_data = [
    ['low-odds-top', 21, 12, 1, 0, 8, 1.360, 0.7513, 92.3],
    ['high-conviction', 8, 7, 1, 0, 0, 2.256, 0.6851, 87.5],
    ['balanced', 10, 6, 4, 0, 0, 3.251, 0.5734, 60.0],
    ['totals', 10, 5, 4, 1, 0, 3.124, 0.4836, 55.6],
    ['default', 7, 2, 4, 0, 1, 1.889, 0.6679, 33.3],
    ['low-variance', 20, 3, 7, 0, 10, 2.109, 0.6229, 30.0],
    ['review', 3, 0, 3, 0, 0, 2.185, 0.5908, 0.0],
    ['conservative', 1, 0, 1, 0, 0, 2.033, 0.6200, 0.0],
    ['parlay-oro', 2, 0, 0, 0, 2, 1.921, 0.6565, None]
]
perfil_cols = ['Perfil', 'Parlays', 'Won', 'Lost', 'Voided', 'Sin_validar', 'Cuota_prom', 'Conf_prom', 'Hit_rate']
df_perfil = pd.DataFrame(perfil_data, columns=perfil_cols)

# Plotting settings
sns.set_theme(style="whitegrid")
plt.rcParams['font.family'] = 'sans-serif'
fig, axes = plt.subplots(2, 2, figsize=(16, 12))
fig.suptitle('Análisis de Rendimiento de Predicciones', fontsize=20, fontweight='bold', y=0.98)

# 1. Hit Rate by Perfil (excluding N/A)
df_perfil_plot = df_perfil.dropna(subset=['Hit_rate']).sort_values('Hit_rate', ascending=False)
sns.barplot(x='Hit_rate', y='Perfil', data=df_perfil_plot, ax=axes[0, 0], palette='viridis')
axes[0, 0].set_title('Hit Rate por Perfil de Apuesta (%)', fontsize=14)
axes[0, 0].set_xlabel('Hit Rate (%)')
axes[0, 0].set_ylabel('')
axes[0, 0].set_xlim(0, 100)
for p in axes[0, 0].patches:
    axes[0, 0].annotate(f'{p.get_width():.1f}%', (p.get_width() + 2, p.get_y() + p.get_height() / 2.), 
                        ha='center', va='center', fontsize=10, color='black')

# 2. Hit Rate by Rango de Cuota
sns.barplot(x='Rango', y='Hit_rate', data=df_cuota, ax=axes[0, 1], palette='coolwarm')
axes[0, 1].set_title('Hit Rate por Rango de Cuota (%)', fontsize=14)
axes[0, 1].set_xlabel('Rango de Cuota')
axes[0, 1].set_ylabel('Hit Rate (%)')
axes[0, 1].set_ylim(0, 100)
for p in axes[0, 1].patches:
    axes[0, 1].annotate(f'{p.get_height():.1f}%', (p.get_x() + p.get_width() / 2., p.get_height() + 2), 
                        ha='center', va='center', fontsize=10, color='black')

# 3. Hit Rate by Confianza Agregada
sns.barplot(x='Confianza', y='Hit_rate', data=df_conf, ax=axes[1, 0], palette='magma')
axes[1, 0].set_title('Hit Rate por Confianza Agregada (%)', fontsize=14)
axes[1, 0].set_xlabel('Confianza Agregada')
axes[1, 0].set_ylabel('Hit Rate (%)')
axes[1, 0].set_ylim(0, 110)
for p in axes[1, 0].patches:
    axes[1, 0].annotate(f'{p.get_height():.1f}%', (p.get_x() + p.get_width() / 2., p.get_height() + 2), 
                        ha='center', va='center', fontsize=10, color='black')

# 4. Win/Loss/Pending Volume by Profile
df_perfil_vol = df_perfil.set_index('Perfil')[['Won', 'Lost', 'Voided', 'Sin_validar']]
df_perfil_vol.plot(kind='bar', stacked=True, ax=axes[1, 1], color=['#2ca02c', '#d62728', '#7f7f7f', '#1f77b4'])
axes[1, 1].set_title('Volumen y Estado de Parlays por Perfil', fontsize=14)
axes[1, 1].set_xlabel('')
axes[1, 1].set_ylabel('Cantidad de Parlays')
axes[1, 1].legend(title='Estado', loc='upper right')
plt.xticks(rotation=45, ha='right')

plt.tight_layout(rect=[0, 0, 1, 0.96])
plt.savefig('dashboard_summary.png', dpi=300)
plt.show()