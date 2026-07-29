"""Evidence adapter: local mock, S3, or Azure Blob; state stores references only."""
from __future__ import annotations
import base64
import os
import re
from pathlib import Path

MAX_EVIDENCE_BYTES = int(os.environ.get("MAX_EVIDENCE_BYTES", str(5 * 1024 * 1024)))
CLAIM_ID_PATTERN = re.compile(
    r"^CLM-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
)


class EvidenceConflictError(RuntimeError):
    pass

class EvidenceStore:
    def _key(self, claim_id: str) -> str:
        if not CLAIM_ID_PATTERN.fullmatch(claim_id):
            raise ValueError("invalid_claim_id")
        return f"evidence/{claim_id}"

    def validate(self, claim_id: str, image_b64: str) -> bytes:
        self._key(claim_id)
        try:
            data = base64.b64decode(image_b64, validate=True)
        except Exception as error:
            raise ValueError("invalid_evidence_encoding") from error
        if len(data) > MAX_EVIDENCE_BYTES:
            raise ValueError("evidence_too_large")
        return data

    def put(self, claim_id: str, image_b64: str) -> str:
        data = self.validate(claim_id, image_b64)
        key = self._key(claim_id)
        backend = os.environ.get("EVIDENCE_BACKEND", "local").lower()
        if backend == "s3":
            import boto3
            try:
                boto3.client("s3").put_object(
                    Bucket=os.environ["EVIDENCE_BUCKET"],
                    Key=key,
                    Body=data,
                    IfNoneMatch="*",
                )
            except Exception as error:
                if "Precondition" in type(error).__name__ or "412" in str(error):
                    raise EvidenceConflictError(key) from error
                raise
        elif backend == "blob":
            from azure.storage.blob import BlobServiceClient
            from agents.shared.identity import get_azure_credential
            try:
                BlobServiceClient(
                    os.environ["BLOB_ENDPOINT"],
                    credential=get_azure_credential(),
                ).get_blob_client(
                    os.environ["BLOB_CONTAINER"],
                    key,
                ).upload_blob(data, overwrite=False)
            except Exception as error:
                if "Exists" in type(error).__name__ or "409" in str(error):
                    raise EvidenceConflictError(key) from error
                raise
        else:
            root = Path(os.environ.get("EVIDENCE_LOCAL_DIR", ".evidence")).resolve()
            path = (root / key).resolve()
            if root not in path.parents:
                raise ValueError("unsafe_evidence_path")
            path.parent.mkdir(parents=True, exist_ok=True)
            try:
                with path.open("xb") as stream:
                    stream.write(data)
            except FileExistsError as error:
                raise EvidenceConflictError(key) from error
        return key

    def get(self, object_ref: str) -> str:
        if not object_ref.startswith("evidence/"):
            raise ValueError("invalid_evidence_reference")
        backend = os.environ.get("EVIDENCE_BACKEND", "local").lower()
        if backend == "s3":
            import boto3
            data = boto3.client("s3").get_object(
                Bucket=os.environ["EVIDENCE_BUCKET"],
                Key=object_ref,
            )["Body"].read()
        elif backend == "blob":
            from azure.storage.blob import BlobServiceClient
            from agents.shared.identity import get_azure_credential
            data = BlobServiceClient(
                os.environ["BLOB_ENDPOINT"],
                credential=get_azure_credential(),
            ).get_blob_client(
                os.environ["BLOB_CONTAINER"],
                object_ref,
            ).download_blob().readall()
        else:
            root = Path(os.environ.get("EVIDENCE_LOCAL_DIR", ".evidence")).resolve()
            path = (root / object_ref).resolve()
            if root not in path.parents:
                raise ValueError("unsafe_evidence_path")
            data = path.read_bytes()
        return base64.b64encode(data).decode("ascii")

    def delete(self, object_ref: str) -> None:
        backend = os.environ.get("EVIDENCE_BACKEND", "local").lower()
        try:
            if backend == "s3":
                import boto3
                boto3.client("s3").delete_object(
                    Bucket=os.environ["EVIDENCE_BUCKET"],
                    Key=object_ref,
                )
            elif backend == "blob":
                from azure.storage.blob import BlobServiceClient
                from agents.shared.identity import get_azure_credential
                BlobServiceClient(
                    os.environ["BLOB_ENDPOINT"],
                    credential=get_azure_credential(),
                ).get_blob_client(
                    os.environ["BLOB_CONTAINER"],
                    object_ref,
                ).delete_blob()
            else:
                root = Path(os.environ.get("EVIDENCE_LOCAL_DIR", ".evidence")).resolve()
                path = (root / object_ref).resolve()
                if root in path.parents:
                    path.unlink(missing_ok=True)
        except Exception:
            pass
