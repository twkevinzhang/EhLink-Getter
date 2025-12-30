class LinkInfo:
    def __init__(self, title: str, link: str):
        self.title = title
        self.link = link

    def toString(self):
        return f"{self.title}\t{self.link}"
