#!/bin/sh
# Boot the Django service: migrate, seed only if the volume is empty, serve.
set -e
python manage.py migrate --noinput
python manage.py shell -c "import sys; from forecast.models import PriceObservation; sys.exit(0 if PriceObservation.objects.exists() else 1)" \
  || python manage.py seed
exec gunicorn config.wsgi -b 0.0.0.0:8000 --workers 2
