"""
Scraper - Plan de Estudios Ingeniería en Materiales (Plan 1217), TEC
=====================================================================

Prerrequisitos:
    pip install selenium webdriver-manager

Uso:
    1. Corre este script: python scraper_tec_materiales.py
    2. Iniciá sesión manualmente cuando abra el browser (tenés 90 segundos)
    3. El script navega solo a Materiales 1217 y guarda page_source.html
    4. Luego corrés parse_plan_estudios.py para generar el JSON final
"""

import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

URL = "https://tecdigital.tec.ac.cr/tda-expediente-estudiantil/"

# Valores exactos de los <select> del DOM
SEDE_VALUE    = "CA"    # Campus Tecnológico Central Cartago
CARRERA_VALUE = "ME"    # Escuela de Ciencia e Ing. de Los Materiales
PLAN_VALUE    = "1217"  # Plan Ingeniería en Materiales

# Primera sigla de Materiales que debe aparecer al cargar el plan correcto
# Usada como señal de que AngularJS terminó de renderizar
SIGLA_CENTINELA = "CI0200"  # aparece en todos los planes; se reemplaza por CM abajo
# Mejor usar una sigla exclusiva de Materiales para confirmar que cargó el plan correcto
SIGLA_MATERIALES = "CM"  # prefijo de cursos de Ciencia de Materiales


def get_driver():
    options = Options()
    # Mantener el browser abierto al terminar (útil para debug)
    options.add_experimental_option("detach", True)
    try:
        from webdriver_manager.chrome import ChromeDriverManager
        from selenium.webdriver.chrome.service import Service
        service = Service(ChromeDriverManager().install())
        return webdriver.Chrome(service=service, options=options)
    except Exception:
        return webdriver.Chrome(options=options)


def select_by_value(driver, select_id, value, timeout=15):
    """Selecciona una opción en un <select> nativo por su atributo value."""
    wait = WebDriverWait(driver, timeout)
    sel_el = wait.until(EC.presence_of_element_located((By.ID, select_id)))
    # Scroll al elemento para asegurar visibilidad
    driver.execute_script("arguments[0].scrollIntoView(true);", sel_el)
    select = Select(sel_el)
    select.select_by_value(value)
    # Verificar selección
    selected = Select(driver.find_element(By.ID, select_id)).first_selected_option
    print(f"  [{select_id}] seleccionado: '{selected.text.strip()}'")


def trigger_ng_change(driver, select_id):
    """
    AngularJS a veces no detecta cambios hechos por Selenium.
    Disparamos el evento 'change' manualmente via JS para activar ng-change.
    """
    driver.execute_script(f"""
        var el = document.getElementById('{select_id}');
        var event = new Event('change', {{ bubbles: true }});
        el.dispatchEvent(event);
        // Angular scope digest
        try {{
            var scope = angular.element(el).scope();
            scope.$apply();
        }} catch(e) {{}}
    """)


def wait_for_plan_loaded(driver, timeout=20):
    """
    Espera hasta que AngularJS haya renderizado los cursos del plan de Materiales.
    Condición: que exista al menos un div cuyo id empiece con 'CM'
    (sigla de los cursos de Ciencia de Materiales).
    """
    print("  Esperando que cargue el plan de Materiales", end="", flush=True)
    wait = WebDriverWait(driver, timeout)
    try:
        # Esperar que aparezca algún div con id que empiece en CM (ej: CM2401, CM3207...)
        wait.until(lambda d: len(d.find_elements(
            By.XPATH, "//div[starts-with(@id,'CM') and @ng-click]"
        )) > 0)
        print(" ✓")
        return True
    except Exception:
        print(" ✗ timeout")
        return False


def navigate_to_materiales(driver):
    driver.get(URL)
    print(f"Abriendo {URL}")

    wait = WebDriverWait(driver, 30)

    # ── Paso 1: Esperar login manual ───────────────────────────────────────────
    print("\n[1/5] Esperando inicio de sesión (90 segundos máximo)...")
    try:
        WebDriverWait(driver, 90).until(
            EC.presence_of_element_located((By.ID, "select_sede"))
        )
        print("  Sesión activa detectada ✓")
    except Exception:
        print("  No se detectó el select de sede. Verificá que iniciaste sesión.")
        input("  Presioná ENTER cuando la página esté lista...")

    # ── Paso 2: Click en pestaña Plan de Estudios ──────────────────────────────
    print("\n[2/5] Navegando a Plan de Estudios...")
    try:
        plan_tab = wait.until(EC.element_to_be_clickable(
            (By.XPATH, "//*[contains(text(),'Plan de Estudios')]")
        ))
        plan_tab.click()
        time.sleep(1.5)
        print("  Click en pestaña ✓")
    except Exception as e:
        print(f"  No se encontró la pestaña: {e}")

    # ── Paso 3: Seleccionar Sede ───────────────────────────────────────────────
    print(f"\n[3/5] Seleccionando sede (value='{SEDE_VALUE}')...")
    wait.until(EC.presence_of_element_located((By.ID, "select_sede")))
    select_by_value(driver, "select_sede", SEDE_VALUE)
    trigger_ng_change(driver, "select_sede")
    # Esperar que el select de carrera se repopule con las carreras de esa sede
    time.sleep(2)

    # ── Paso 4: Seleccionar Carrera ────────────────────────────────────────────
    print(f"\n[4/5] Seleccionando carrera (value='{CARRERA_VALUE}')...")
    # Esperar que la opción ME esté disponible
    WebDriverWait(driver, 10).until(
        EC.presence_of_element_located(
            (By.CSS_SELECTOR, f"#select_carrera option[value='{CARRERA_VALUE}']")
        )
    )
    select_by_value(driver, "select_carrera", CARRERA_VALUE)
    trigger_ng_change(driver, "select_carrera")
    # Esperar que se carguen los planes de esa carrera
    time.sleep(2)

    # ── Paso 5: Seleccionar Plan 1217 ──────────────────────────────────────────
    print(f"\n[5/5] Seleccionando plan '{PLAN_VALUE}'...")
    WebDriverWait(driver, 10).until(
        EC.presence_of_element_located(
            (By.CSS_SELECTOR, f"#select_plan option[value='{PLAN_VALUE}']")
        )
    )
    select_by_value(driver, "select_plan", PLAN_VALUE)
    trigger_ng_change(driver, "select_plan")
    time.sleep(1)

    # ── Click en el botón buscar (lupa) ───────────────────────────────────────
    print("\nClickeando botón buscar (actualizarDatos)...")
    try:
        buscar_btn = driver.find_element(By.ID, "imgBuscar_tdsLib")
        buscar_btn.click()
        print("  Click en lupa ✓")
    except Exception:
        # Fallback: disparar actualizarDatos() directo desde JS
        try:
            driver.execute_script("""
                var scope = angular.element(document.getElementById('select_plan')).scope();
                scope.actualizarDatos();
                scope.$apply();
            """)
            print("  actualizarDatos() via JS ✓")
        except Exception as e2:
            print(f"  No se pudo clickear buscar: {e2}")

    # ── Esperar que el plan de Materiales cargue ──────────────────────────────
    loaded = wait_for_plan_loaded(driver, timeout=20)

    if not loaded:
        print("\n⚠  El plan no cargó con cursos CM en 20 segundos.")
        print("   Verificá manualmente que la malla de Materiales esté visible.")
        input("   Cuando la malla esté visible, presioná ENTER para guardar...")
    else:
        # Dar un segundo extra para que AngularJS termine de renderizar todo
        time.sleep(2)

    return loaded


def save_page_source(driver, path="page_source.html"):
    with open(path, "w", encoding="utf-8") as f:
        f.write(driver.page_source)
    print(f"\n✓ page_source.html guardado ({path})")


def main():
    print("=" * 55)
    print("Scraper - Plan de Estudios Ingeniería en Materiales")
    print("TEC | Plan 1217")
    print("=" * 55)

    driver = get_driver()

    try:
        navigate_to_materiales(driver)
        save_page_source(driver)

        print("\nListo. Ahora corrés parse_plan_estudios.py para generar el JSON.")
        print("(El browser se mantiene abierto para que puedas verificar visualmente)")

    except KeyboardInterrupt:
        print("\nInterrumpido por el usuario.")
    except Exception as e:
        print(f"\nError inesperado: {e}")
        import traceback
        traceback.print_exc()
        # Guardar lo que haya de todos modos
        try:
            save_page_source(driver, "page_source_error.html")
        except Exception:
            pass
    finally:
        input("\nPresioná ENTER para cerrar el browser...")
        try:
            driver.quit()
        except Exception:
            pass


if __name__ == "__main__":
    main()