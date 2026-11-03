from django.core.management.base import BaseCommand
from forecast import services

class Command(BaseCommand):
    help = "Load price_data.csv, clean it, fit the first model, store the first forecast."
    def handle(self, *args, **opts):
        r = services.seed_from_csv()
        self.stdout.write(self.style.SUCCESS(f"Seeded: {r}"))
