from pydantic import BaseModel

class LinkInfo(BaseModel):
    title: str
    link: str

    def to_tsv(self):
        return f"{self.title}\t{self.link}"
