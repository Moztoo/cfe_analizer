FROM python:3.11-alpine

ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Copiar código del proyecto
COPY . /app

# Dar permisos de ejecución a los scripts
RUN chmod +x /app/run.sh /app/app.py

EXPOSE 8050

CMD [ "/app/run.sh" ]
