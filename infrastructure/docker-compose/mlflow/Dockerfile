FROM python:3.11-slim

RUN pip install --no-cache-dir mlflow==2.11.0 psycopg2-binary boto3

EXPOSE 5000

ENTRYPOINT ["mlflow", "server", \
  "--backend-store-uri", "postgresql://mlops:mlops_secret@postgres:5432/mlflow", \
  "--default-artifact-root", "s3://mlflow-artifacts/", \
  "--host", "0.0.0.0", \
  "--port", "5000"]
