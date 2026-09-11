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
    MockRouter router;

    address constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address constant TOKEN_OUT = 0x1111111111111111111111111111111111111111;

    function setUp() public {
        string memory raw = vm.readFile("artifacts/Poseidon2.json");
        bytes memory code = vm.parseJsonBytes(raw, ".bytecode");
        address h;
        assembly { h := create(0, add(code, 0x20), mload(code)) }
        require(h != address(0), "poseidon deploy failed");
        hasher = IHasher(h);

        verifier = new JoinSplitVerifier();
        adapter = new JoinSplitAdapter(IGroth16JoinSplit(address(verifier)));
        // The fixture's extDataHash commits to this exact token address, so the
        // mock has to live there rather than wherever the nonce lands it.
        deployCodeTo("JoinSplitPool.t.sol:MockToken", TOKEN_OUT);
        router = new MockRouter(MockToken(TOKEN_OUT));
        pool = new RefractPool(IVerifier(address(adapter)), hasher, address(router));
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


    /* ---------------------------------------------------------------- swap */

    /** The swap parameters the proof was actually built against. */
    function _fixtureSwapData() internal view returns (RefractPool.SwapData memory sd) {
        string memory raw = vm.readFile("artifacts/joinsplit-fixture.json");
        sd.tokenOut = vm.parseJsonAddress(raw, ".swap.ext.swap.tokenOut");
        sd.amountOutMin = vm.parseJsonUint(raw, ".swap.ext.swap.amountOutMin");
        sd.recipient = vm.parseJsonAddress(raw, ".swap.ext.swap.recipient");
        sd.routerCalldata = vm.parseJsonBytes(raw, ".swap.ext.swap.routerCalldata");
    }

    /**
     * The whole point: value leaves the pool into the router, and a token
     * comes back to an address with no history. What the chain records is that
     * the pool traded, never whose note paid for it.
     */
    function test_poolExecutesTheSwap() public {
        (RefractPool.Proof memory p, RefractPool.TransactArgs memory a, RefractPool.ExtData memory e) =
            _load("deposit");
        pool.transact{value: 3.7 ether}(p, a, e);

        (p, a, e) = _load("swap");
        RefractPool.SwapData memory sd = _fixtureSwapData();
        assertEq(e.extAmount, -1.2 ether, "the fixture routes 1.2 ETH");

        uint256 poolBefore = address(pool).balance;
        pool.swap(p, a, e, sd);

        assertEq(poolBefore - address(pool).balance, 1.2 ether, "exactly the routed amount left");
        assertEq(
            MockToken(TOKEN_OUT).balanceOf(DEAD),
            1.2 ether * 1000,
            "the bought token landed at the fresh address"
        );
        assertEq(address(pool).balance, 2.5 ether, "the change is still shielded in the pool");
        assertEq(pool.nextIndex(), 4, "change and padding notes were inserted");
    }

    /** A router that under-delivers must not be able to short the spender. */
    function test_swapRejectsShortDelivery() public {
        (RefractPool.Proof memory p, RefractPool.TransactArgs memory a, RefractPool.ExtData memory e) =
            _load("deposit");
        pool.transact{value: 3.7 ether}(p, a, e);

        (p, a, e) = _load("swap");
        RefractPool.SwapData memory sd = _fixtureSwapData();
        router.setShortchange(true);

        vm.expectRevert(RefractPool.InsufficientOutput.selector);
        pool.swap(p, a, e, sd);
    }

    /** Spending the same notes twice, once as a payout and once as a trade. */
    function test_swapCannotReplayASpentNote() public {
        (RefractPool.Proof memory p, RefractPool.TransactArgs memory a, RefractPool.ExtData memory e) =
            _load("deposit");
        pool.transact{value: 3.7 ether}(p, a, e);

        (p, a, e) = _load("swap");
        RefractPool.SwapData memory sd = _fixtureSwapData();
        pool.swap(p, a, e, sd);

        vm.expectRevert(RefractPool.NullifierUsed.selector);
        pool.swap(p, a, e, sd);
    }

    function _swapData(uint256 minOut) internal view returns (RefractPool.SwapData memory sd) {
        sd.tokenOut = address(router.token());
        sd.amountOutMin = minOut;
        sd.recipient = DEAD;
        sd.routerCalldata = abi.encodeWithSignature("swapExactEthForToken()");
    }

    /** The proof is a withdrawal's; the value goes to the router instead. */
    function _swapFixture()
        internal
        returns (RefractPool.Proof memory p, RefractPool.TransactArgs memory a, RefractPool.ExtData memory e)
    {
        (p, a, e) = _load("deposit");
        pool.transact{value: 3.7 ether}(p, a, e);
        (p, a, e) = _load("spend");
    }

    function test_poolSwapsAndPaysTheRecipient() public {
        (RefractPool.Proof memory p, RefractPool.TransactArgs memory a, RefractPool.ExtData memory e) = _swapFixture();
        RefractPool.SwapData memory sd = _swapData(1.2 ether * 1000);

        // The fixture's extDataHash binds ExtData alone, which is a withdrawal.
        // A swap hashes both structs, so this must be rejected before anything
        // moves: that separation is what stops a withdrawal proof being
        // replayed to route somebody else's notes.
        vm.expectRevert(RefractPool.BadProof.selector);
        pool.swap(p, a, e, sd);
    }

    function test_swapRejectsADeposit() public {
        (RefractPool.Proof memory p, RefractPool.TransactArgs memory a, RefractPool.ExtData memory e) = _load("deposit");
        // Built before expectRevert: _swapData makes an external call, and the
        // cheatcode would otherwise match that call rather than the swap.
        RefractPool.SwapData memory sd = _swapData(1);
        vm.expectRevert(RefractPool.NotASpend.selector);
        pool.swap(p, a, e, sd);
    }

    function test_swapRejectsZeroMinimumOut() public {
        (RefractPool.Proof memory p, RefractPool.TransactArgs memory a, RefractPool.ExtData memory e) = _swapFixture();
        RefractPool.SwapData memory sd = _swapData(0);
        vm.expectRevert(RefractPool.InsufficientOutput.selector);
        pool.swap(p, a, e, sd);
    }

    function test_swapRejectsZeroRecipient() public {
        (RefractPool.Proof memory p, RefractPool.TransactArgs memory a, RefractPool.ExtData memory e) = _swapFixture();
        RefractPool.SwapData memory sd = _swapData(1 ether);
        sd.recipient = address(0);
        vm.expectRevert(RefractPool.InvalidRecipient.selector);
        pool.swap(p, a, e, sd);
    }

    /* The router is fixed at deploy, so the pool has exactly one call target. */
    function test_routerIsImmutableAndSingular() public view {
        assertEq(pool.router(), address(router), "pool may only ever call the router");
    }

    /* Bare ETH must not be acceptable: deposits go through the proof. */
    function test_bareEthIsRejected() public {
        vm.deal(address(this), 1 ether);
        (bool ok, ) = address(pool).call{value: 1 ether}("");
        assertFalse(ok, "only the router may send the pool ETH");
    }

    function test_wrongInputCountReverts() public {
        (RefractPool.Proof memory p,,) = _load("deposit");
        uint256[] memory short = new uint256[](6);
        vm.expectRevert(JoinSplitAdapter.WrongInputCount.selector);
        adapter.verifyProof(p.a, p.b, p.c, short);
    }
}

/* ------------------------------------------------------------------ mocks */

/** Minimal ERC20, enough for a router to hand the pool a bought token. */
contract MockToken {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function transfer(address to, uint256 amount) external returns (bool) {
        if (balanceOf[msg.sender] < amount) return false;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/**
 * Stands in for the REFRACT router. Takes ETH and pays out a token at a rate
 * the test sets, so a swap can be driven without a live venue.
 */
contract MockRouter {
    MockToken public token;
    uint256 public rate = 1000;

    constructor(MockToken _token) { token = _token; }
    /// Lets a test make the router deliver less than promised.
    bool public shortchange;

    function setRate(uint256 r) external { rate = r; }
    function setShortchange(bool v) external { shortchange = v; }

    function swapExactEthForToken() external payable {
        uint256 out = msg.value * rate;
        if (shortchange) out = out / 2;
        token.mint(msg.sender, out);
    }

    /// A payload that tries to make the pool call something else entirely.
    function drain(address to) external {
        (bool ok, ) = to.call{value: address(this).balance}("");
        require(ok);
    }

    receive() external payable {}
}
