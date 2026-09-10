// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/RefractPool.sol";
import "../src/JoinSplitVerifier.sol";
import "../src/JoinSplitAdapter.sol";

/**
 * The hidden-amount pool, driven by genuine proofs.
 *
 * Fixtures come from circuits/jstest.mjs: a real 3.7 ETH deposit and a real
 * partial spend of 1.2 that leaves 2.5 shielded, both proved against the
 * compiled circuit. This is the test that shows arbitrary deposits and partial
 * withdrawals actually work, rather than that the maths type-checks.
 */
contract JoinSplitPoolTest is Test {
    RefractPool pool;
    JoinSplitVerifier verifier;
    JoinSplitAdapter adapter;
    IHasher hasher;

    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    function setUp() public {
        string memory raw = vm.readFile("artifacts/Poseidon2.json");
        bytes memory code = vm.parseJsonBytes(raw, ".bytecode");
        address h;
        assembly { h := create(0, add(code, 0x20), mload(code)) }
        require(h != address(0), "poseidon deploy failed");
        hasher = IHasher(h);

        verifier = new JoinSplitVerifier();
        adapter = new JoinSplitAdapter(IGroth16JoinSplit(address(verifier)));
        pool = new RefractPool(IVerifier(address(adapter)), hasher);
    }

    function _load(string memory tag)
        internal
        view
        returns (RefractPool.Proof memory p, RefractPool.TransactArgs memory a, RefractPool.ExtData memory e)
    {
        string memory raw = vm.readFile("artifacts/joinsplit-fixture.json");
        uint256[] memory f = vm.parseJsonUintArray(raw, string.concat(".", tag, ".flat"));
        p.a = [f[0], f[1]];
        p.b = [[f[2], f[3]], [f[4], f[5]]];
        p.c = [f[6], f[7]];
        a.root = bytes32(f[8]);
        a.publicAmount = f[9];
        a.extDataHash = bytes32(f[10]);
        a.inNullifiers = [bytes32(f[11]), bytes32(f[12])];
        a.outCommitments = [bytes32(f[13]), bytes32(f[14])];

        string memory b = string.concat(".", tag, ".ext");
        e.recipient = vm.parseJsonAddress(raw, string.concat(b, ".recipient"));
        e.extAmount = vm.parseJsonInt(raw, string.concat(b, ".extAmount"));
        e.relayer = vm.parseJsonAddress(raw, string.concat(b, ".relayer"));
        e.fee = vm.parseJsonUint(raw, string.concat(b, ".fee"));
        e.encryptedOutput1 = vm.parseJsonBytes(raw, string.concat(b, ".encryptedOutput1"));
        e.encryptedOutput2 = vm.parseJsonBytes(raw, string.concat(b, ".encryptedOutput2"));
    }

    /* The whole point: any amount in, part of it back out. */
    function test_arbitraryDepositThenPartialSpend() public {
        (RefractPool.Proof memory p, RefractPool.TransactArgs memory a, RefractPool.ExtData memory e) =
            _load("deposit");

        assertEq(uint256(e.extAmount), 3.7 ether, "fixture deposits an arbitrary amount");
        pool.transact{value: 3.7 ether}(p, a, e);
        assertEq(address(pool).balance, 3.7 ether, "pool holds the deposit");
        assertEq(pool.nextIndex(), 2, "two output notes were inserted");

        (p, a, e) = _load("spend");
        assertEq(e.extAmount, -1.2 ether, "fixture spends part of the note");

        uint256 before = DEAD.balance;
        pool.transact(p, a, e);

        assertEq(DEAD.balance - before, 1.2 ether, "recipient got exactly the spent part");
        assertEq(address(pool).balance, 2.5 ether, "the change stays in the pool, still shielded");
        assertEq(pool.nextIndex(), 4, "change and padding notes were inserted");
    }

    function test_depositMustMatchDeclaredAmount() public {
        (RefractPool.Proof memory p, RefractPool.TransactArgs memory a, RefractPool.ExtData memory e) =
            _load("deposit");
        vm.expectRevert(RefractPool.WrongValue.selector);
        pool.transact{value: 3.6 ether}(p, a, e);
    }

    function test_nullifierCannotBeReused() public {
        (RefractPool.Proof memory p, RefractPool.TransactArgs memory a, RefractPool.ExtData memory e) =
            _load("deposit");
        pool.transact{value: 3.7 ether}(p, a, e);
        (p, a, e) = _load("spend");
        pool.transact(p, a, e);
        vm.expectRevert(RefractPool.NullifierUsed.selector);
        pool.transact(p, a, e);
    }

    /* Rewriting the recipient mid-flight is the attack extDataHash exists to stop. */
    function test_recipientCannotBeSwapped() public {
        (RefractPool.Proof memory p, RefractPool.TransactArgs memory a, RefractPool.ExtData memory e) =
            _load("deposit");
        pool.transact{value: 3.7 ether}(p, a, e);

        (p, a, e) = _load("spend");
        e.recipient = address(0xBAD);
        vm.expectRevert(RefractPool.BadProof.selector);
        pool.transact(p, a, e);
    }

    function test_amountCannotBeInflated() public {
        (RefractPool.Proof memory p, RefractPool.TransactArgs memory a, RefractPool.ExtData memory e) =
            _load("deposit");
        pool.transact{value: 3.7 ether}(p, a, e);

        (p, a, e) = _load("spend");
        e.extAmount = -3.7 ether;   // try to take the whole note, not the part proved
        vm.expectRevert(RefractPool.BadProof.selector);
        pool.transact(p, a, e);
    }

    function test_unknownRootIsRejected() public {
        (RefractPool.Proof memory p, RefractPool.TransactArgs memory a, RefractPool.ExtData memory e) =
            _load("spend");
        vm.expectRevert(RefractPool.UnknownRoot.selector);
        pool.transact(p, a, e);
    }

    function test_wrongInputCountReverts() public {
        (RefractPool.Proof memory p,,) = _load("deposit");
        uint256[] memory short = new uint256[](6);
        vm.expectRevert(JoinSplitAdapter.WrongInputCount.selector);
        adapter.verifyProof(p.a, p.b, p.c, short);
    }
}
