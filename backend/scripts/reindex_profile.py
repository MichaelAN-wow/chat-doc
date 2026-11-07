from app.tasks.document_tasks import process_document

DOC_ID = "534bd069-0e51-49a4-9c7e-9e82ca25207c"


if __name__ == "__main__":
    # Run the task body in-process (no Celery broker round-trip).
    print(process_document.run(DOC_ID))
