export class SnapshotHistory {
  private entries: string[] = []
  private index = -1
  private readonly limit: number

  constructor(limit = 80) { this.limit = limit }

  get canUndo() { return this.index > 0 }
  get canRedo() { return this.index >= 0 && this.index < this.entries.length - 1 }

  reset(snapshot: string) {
    this.entries = [snapshot]
    this.index = 0
  }

  push(snapshot: string) {
    if (this.entries[this.index] === snapshot) return
    this.entries = this.entries.slice(0, this.index + 1)
    this.entries.push(snapshot)
    if (this.entries.length > this.limit) this.entries.shift()
    this.index = this.entries.length - 1
  }

  undo() {
    if (!this.canUndo) return null
    return this.entries[--this.index]
  }

  redo() {
    if (!this.canRedo) return null
    return this.entries[++this.index]
  }
}
