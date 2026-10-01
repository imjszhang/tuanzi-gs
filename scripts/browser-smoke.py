"""Compatibility entry point. v0.1 expectations were replaced by v0.2 checks."""
import pathlib, runpy
runpy.run_path(str(pathlib.Path(__file__).with_name('browser-v02.py')),run_name='__main__')
