"""
Parser del Plan de Estudios - TEC
Lee el page_source.html capturado por el scraper y genera el JSON
con todos los cursos, requisitos y correquisitos.

Uso:
    pip install beautifulsoup4
    python parse_plan_estudios.py

El archivo page_source.html debe estar en el mismo directorio.
Para obtenerlo: corre scraper_tec_materiales.py, navega al plan de
Ingeniería en Materiales (1217) y el scraper lo guarda automáticamente.
"""

import json
import re
from pathlib import Path
from bs4 import BeautifulSoup

HTML_FILE = "page_source.html"
OUTPUT_JSON = "plan_materiales_1217.json"

# ─── Área por prefijo de sigla ────────────────────────────────────────────────
AREA_MAP = {
    "CM": "Ciencia de Materiales",
    "FI": "Física",
    "MA": "Matemáticas",
    "QU": "Química",
    "MI": "Ingeniería Mecánica",
    "CI": "Ciencias Básicas",
    "CS": "Ciencias Sociales",
    "AE": "Administración e Ingeniería",
    "FH": "Formación Humanística",
    "CA": "Ciencias Básicas",
    "IC": "Ingeniería en Computación",
    "SE": "Deportes y Cultura",
}

def guess_area(sigla: str) -> str:
    prefix = re.match(r'^([A-Z]+)', sigla)
    if not prefix:
        return "General"
    return AREA_MAP.get(prefix.group(1), "General")


def parse_plan(html_path: str) -> dict:
    with open(html_path, encoding="utf-8") as f:
        soup = BeautifulSoup(f, "html.parser")

    cursos = []
    enlaces = []
    seen_siglas = set()

    # El sitio usa AngularJS con ng-repeat="level in Courses.levels"
    # Cada level = columna de semestre
    # Dentro: ng-repeat="course in level.courses"
    levels = soup.find_all('div', attrs={'ng-repeat': 'level in Courses.levels'})

    if not levels:
        raise RuntimeError(
            "No se encontraron datos de plan de estudios en el HTML.\n"
            "Asegurate de haber capturado la página DESPUÉS de seleccionar\n"
            "la carrera Ingeniería en Materiales y el plan 1217."
        )

    print(f"Semestres encontrados: {len(levels)}")

    for level_div in levels:
        # Número de semestre
        sem_span = level_div.find('span', class_='ng-binding')
        sem_text = sem_span.text.strip() if sem_span else ""
        sem_m = re.search(r'Semestre\s*(\d+)', sem_text)
        sem_num = int(sem_m.group(1)) if sem_m else -1

        # Tarjetas de curso
        course_cards = level_div.find_all(
            'div', attrs={'ng-repeat': 'course in level.courses'}
        )
        print(f"  Semestre {sem_num}: {len(course_cards)} cursos")

        for card in course_cards:
            card_text = card.get_text('\n', strip=True)

            # Sigla (patrón XX0000 o XX0000X)
            sigla_m = re.search(r'\b([A-Z]{2,3}\d{4}[A-Z]?)\b', card_text)
            if not sigla_m:
                continue
            sigla = sigla_m.group(1)

            if sigla in seen_siglas:
                continue
            seen_siglas.add(sigla)

            # Créditos y horas
            cr_m = re.search(r'(\d+)\s*cr', card_text, re.I)
            h_m  = re.search(r'(\d+)\s*h\b', card_text, re.I)
            creditos = int(cr_m.group(1)) if cr_m else 0
            horas    = int(h_m.group(1))  if h_m  else 0

            # Nombre del curso (primera línea que no sea sigla ni cr/h)
            nombre = sigla  # fallback
            for line in card_text.split('\n'):
                line = line.strip()
                if not line:
                    continue
                if sigla in line:
                    continue
                if re.fullmatch(r'\d+\s*(cr|h)', line, re.I):
                    continue
                if re.search(r'\d+\s*cr|\d+\s*h\b', line, re.I) and len(line) < 15:
                    continue
                if len(line) > 3:
                    # Capitalizar nombre
                    nombre = line.title()
                    break

            # Requisitos
            req_spans = card.find_all(
                'span', attrs={'ng-repeat': 'tag in course.requirements'}
            )
            for span in req_spans:
                req_sigla = span.text.strip()
                if req_sigla:
                    enlaces.append({
                        "fuente": req_sigla,
                        "destino": sigla,
                        "tipo": "requisito"
                    })

            # Correquisitos
            correq_spans = card.find_all(
                'span', attrs={'ng-repeat': 'tag in course.co_requirements'}
            )
            for span in correq_spans:
                creq_sigla = span.text.strip()
                if creq_sigla:
                    enlaces.append({
                        "fuente": creq_sigla,
                        "destino": sigla,
                        "tipo": "correquisito"
                    })

            cursos.append({
                "nombre": nombre,
                "sigla": sigla,
                "semestre": sem_num,
                "creditos": creditos,
                "horas": horas,
                "area": guess_area(sigla)
            })

    # Ordenar cursos por semestre y sigla
    cursos.sort(key=lambda c: (c["semestre"], c["sigla"]))

    # Eliminar duplicados en enlaces
    seen_links = set()
    unique_enlaces = []
    for e in enlaces:
        key = (e["fuente"], e["destino"], e["tipo"])
        if key not in seen_links:
            seen_links.add(key)
            unique_enlaces.append(e)

    return {
        "metadata": {
            "carrera": "Ingeniería en Materiales",
            "plan": "1217",
            "sede": "Campus Tecnológico Central Cartago",
            "fuente": "https://tecdigital.tec.ac.cr/tda-expediente-estudiantil/"
        },
        "nodos": cursos,
        "enlaces": unique_enlaces
    }


def main():
    print("=" * 55)
    print("Parser - Plan de Estudios TEC")
    print("=" * 55)

    if not Path(HTML_FILE).exists():
        print(f"\nERROR: No se encontró '{HTML_FILE}'")
        print("Pasos:")
        print("  1. Corre scraper_tec_materiales.py")
        print("  2. Navega al plan 1217 - Ing. en Materiales")
        print("  3. El scraper guarda el HTML automáticamente")
        print("  4. Volvé a correr este script")
        return

    try:
        data = parse_plan(HTML_FILE)
    except RuntimeError as e:
        print(f"\nERROR: {e}")
        return

    n_cursos  = len(data["nodos"])
    n_enlaces = len(data["enlaces"])

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n✓ JSON guardado: {OUTPUT_JSON}")
    print(f"  {n_cursos} cursos | {n_enlaces} enlaces")

    print("\nCursos por semestre:")
    by_sem = {}
    for c in data["nodos"]:
        by_sem.setdefault(c["semestre"], []).append(c["sigla"])
    for sem in sorted(by_sem):
        print(f"  Semestre {sem}: {', '.join(by_sem[sem])}")

    print("\nEnlaces (muestra):")
    for e in data["enlaces"][:8]:
        print(f"  {e['fuente']} --{e['tipo']}--> {e['destino']}")

    if n_cursos < 10:
        print("\n⚠ Pocos cursos. Verificá que el HTML corresponde al plan de Materiales.")


if __name__ == "__main__":
    main()