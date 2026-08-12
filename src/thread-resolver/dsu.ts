import { ExternalId } from "../repositories/graph.repository";

/**
 * Disjoint Set Union - объединение множеств
 */
export class DisjointSet {
  private readonly parent = new Map<ExternalId, ExternalId>();

  private readonly rank = new Map<ExternalId, number>();

  private readonly canonical = new Map<ExternalId, ExternalId>();

  add(id: ExternalId): void {
    if (this.parent.has(id)) {
      return;
    }

    this.parent.set(id, id);
    this.rank.set(id, 0);
    this.canonical.set(id, id);
  }

  find(id: ExternalId): ExternalId {
    if (!this.parent.has(id)) {
      this.add(id);
      return id;
    }

    const parent = this.parent.get(id)!;

    if (parent !== id) {
      const root = this.find(parent);
      this.parent.set(id, root);
      return root;
    }

    return id;
  }

  union(a: ExternalId, b: ExternalId): void {
    this.add(a);
    this.add(b);

    const rootA = this.find(a);
    const rootB = this.find(b);

    if (rootA === rootB) {
      return;
    }

    const rankA = this.rank.get(rootA)!;
    const rankB = this.rank.get(rootB)!;

    let root: ExternalId;
    let child: ExternalId;

    if (rankA < rankB) {
      root = rootB;
      child = rootA;
    } else {
      root = rootA;
      child = rootB;

      if (rankA === rankB) {
        this.rank.set(root, rankA + 1);
      }
    }

    this.parent.set(child, root);

    const canonicalRoot = this.canonical.get(root)!;

    const canonicalChild = this.canonical.get(child)!;

    this.canonical.set(
      root,
      canonicalRoot < canonicalChild ? canonicalRoot : canonicalChild,
    );
  }

  getThreadKey(id: ExternalId): ExternalId {
    const root = this.find(id);

    return this.canonical.get(root)!;
  }
}
