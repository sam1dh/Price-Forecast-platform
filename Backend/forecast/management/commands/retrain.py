from django.core.management.base import BaseCommand
from forecast import services

class Command(BaseCommand):
    help = "Champion-challenger retrain on the full history (run monthly via cron/Celery beat)."
    def handle(self, *args, **opts):
        mv = services.retrain(trigger="scheduled")
        self.stdout.write(self.style.SUCCESS(f"{mv.version}: promoted={mv.metrics['promoted']} ({mv.metrics['reason']})"))
